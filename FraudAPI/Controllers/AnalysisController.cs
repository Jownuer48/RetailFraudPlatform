using FraudAPI.Data;
using FraudAPI.DTOs;
using FraudAPI.Models;
using FraudAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnalysisController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly RabbitMQService _rabbitMQService;
    private readonly ILogger<AnalysisController> _logger;

    public AnalysisController(
        AppDbContext context,
        RabbitMQService rabbitMQService,
        ILogger<AnalysisController> logger)
    {
        _context = context;
        _rabbitMQService = rabbitMQService;
        _logger = logger;
    }

    [HttpPost("jobs/{jobId:guid}/heartbeat")]
    public async Task<IActionResult> HeartbeatJob(
        Guid jobId,
        [FromBody] JobHeartbeatRequest? request)
    {
        var job = await _context.AnalysisJobs
            .FirstOrDefaultAsync(x => x.Id == jobId);

        if (job is null)
        {
            return NotFound(new
            {
                message = "Job not found",
                jobId
            });
        }

        if (job.Status == AnalysisJobStatus.Completed ||
            job.Status == AnalysisJobStatus.Failed)
        {
            return Ok(new
            {
                message = "Job already finished",
                jobId = job.Id,
                status = job.Status
            });
        }

        var now = DateTime.UtcNow;

        job.LastHeartbeatAtUtc = now;
        job.UpdatedAtUtc = now;

        if (!string.IsNullOrWhiteSpace(request?.WorkerId))
        {
            job.WorkerId = request.WorkerId;
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Heartbeat received",
            jobId = job.Id,
            status = job.Status,
            workerId = job.WorkerId,
            lastHeartbeatAtUtc = job.LastHeartbeatAtUtc
        });
    }

    [HttpPost("trigger")]
    public async Task<IActionResult> TriggerAnalysis([FromBody] TriggerAnalysisRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TransactionId))
        {
            return BadRequest(new
            {
                message = "transactionId is required"
            });
        }

        if (string.IsNullOrWhiteSpace(request.CameraId) &&
            string.IsNullOrWhiteSpace(request.VideoPath))
        {
            return BadRequest(new
            {
                message = "cameraId or videoPath is required"
            });
        }

        string resolvedVideoPath;
        string? cameraId = null;

        if (!string.IsNullOrWhiteSpace(request.CameraId))
        {
            var camera = await _context.Cameras
                .FirstOrDefaultAsync(x => x.Id == request.CameraId && x.IsActive);

            if (camera is null)
            {
                return BadRequest(new
                {
                    message = "Camera not found or inactive",
                    cameraId = request.CameraId
                });
            }

            cameraId = camera.Id;
            resolvedVideoPath = camera.SourceUrl;
        }
        else
        {
            resolvedVideoPath = request.VideoPath!;
        }

        var existingJob = await _context.AnalysisJobs
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(x => x.TransactionId == request.TransactionId);

        if (existingJob is not null &&
            existingJob.Status is AnalysisJobStatus.Queued or AnalysisJobStatus.Processing)
        {
            return Ok(new
            {
                message = "Job already exists",
                jobId = existingJob.Id,
                status = existingJob.Status,
                transactionId = existingJob.TransactionId
            });
        }

        var job = new AnalysisJob
        {
            Id = Guid.NewGuid(),
            TransactionId = request.TransactionId,
            CameraId = cameraId,
            VideoPath = resolvedVideoPath,
            Status = AnalysisJobStatus.Queued,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _context.AnalysisJobs.Add(job);
        await _context.SaveChangesAsync();

        try
        {
            var message = new AnalysisJobMessage(
                JobId: job.Id,
                TransactionId: job.TransactionId,
                CameraId: job.CameraId,
                VideoPath: job.VideoPath,
                CreatedAtUtc: job.CreatedAtUtc
            );

            _rabbitMQService.PublishAnalysisJob(message);

            return Accepted(new
            {
                message = "Job enqueued",
                jobId = job.Id,
                status = job.Status,
                transactionId = job.TransactionId,
                cameraId = job.CameraId
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish job to RabbitMQ. JobId={JobId}", job.Id);

            job.Status = AnalysisJobStatus.Failed;
            job.ErrorMessage = "Failed to publish job to RabbitMQ: " + ex.Message;
            job.FinishedAtUtc = DateTime.UtcNow;
            job.UpdatedAtUtc = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return StatusCode(503, new
            {
                message = "Failed to enqueue job",
                jobId = job.Id,
                error = ex.Message
            });
        }
    }

    [HttpPost("jobs/{jobId:guid}/processing")]
    public async Task<IActionResult> MarkJobProcessing(Guid jobId)
    {
        var job = await _context.AnalysisJobs
            .FirstOrDefaultAsync(x => x.Id == jobId);

        if (job is null)
        {
            return NotFound(new
            {
                message = "Job not found",
                jobId
            });
        }

        if (job.Status == AnalysisJobStatus.Completed ||
            job.Status == AnalysisJobStatus.Failed)
        {
            return Ok(new
            {
                message = "Job already finished",
                jobId = job.Id,
                status = job.Status
            });
        }

        var now = DateTime.UtcNow;

        job.Status = AnalysisJobStatus.Processing;
        job.StartedAtUtc ??= now;
        job.UpdatedAtUtc = now;
        job.LastHeartbeatAtUtc = now;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Job marked as processing",
            jobId = job.Id,
            status = job.Status,
            startedAtUtc = job.StartedAtUtc,
            lastHeartbeatAtUtc = job.LastHeartbeatAtUtc
        });
    }

    [HttpPost("jobs/{jobId:guid}/failed")]
    public async Task<IActionResult> MarkJobAsFailed(
        Guid jobId,
        [FromBody] JobFailedRequest request)
    {
        var job = await _context.AnalysisJobs.FindAsync(jobId);

        if (job is null)
        {
            return NotFound(new
            {
                message = "Job not found",
                jobId
            });
        }

        job.Status = AnalysisJobStatus.Failed;
        job.ErrorMessage = request.ErrorMessage;
        job.FinishedAtUtc = DateTime.UtcNow;
        job.UpdatedAtUtc = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Job marked as failed",
            jobId = job.Id,
            status = job.Status
        });
    }

    [HttpPost("result")]
    public async Task<IActionResult> ReceiveAnalysisResult([FromBody] AiAnalysisResultRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TransactionId))
        {
            return BadRequest(new
            {
                message = "transactionId is required"
            });
        }

        if (string.IsNullOrWhiteSpace(request.RiskLevel))
        {
            return BadRequest(new
            {
                message = "riskLevel is required"
            });
        }

        var now = DateTime.UtcNow;

        AnalysisJob? job = null;

        if (request.JobId.HasValue)
        {
            job = await _context.AnalysisJobs
                .FirstOrDefaultAsync(x => x.Id == request.JobId.Value);
        }

        // Idempotency เบื้องต้น:
        // ถ้า worker ส่ง result ซ้ำหลัง job completed ไปแล้ว ไม่ต้อง insert FraudRecord ซ้ำ
        if (job is not null && job.Status == AnalysisJobStatus.Completed)
        {
            return Ok(new
            {
                message = "Job already completed",
                jobId = job.Id,
                transactionId = request.TransactionId,
                status = job.Status
            });
        }

        var record = new FraudRecord
        {
            TransactionId = request.TransactionId,
            CameraId = job?.CameraId,

            RiskLevel = request.RiskLevel,
            FraudScore = request.FraudScore,
            PresenceTimeSec = request.PresenceTimeSec,
            TotalVideoSec = request.TotalVideoSec,
            Reason = request.Reason,

            SourceType = request.SourceType,
            EvidenceImagePath = request.EvidenceImagePath,
            EvidenceImageUrl = request.EvidenceImageUrl,
            EvidenceFrameNumber = request.EvidenceFrameNumber,
            RoiConfigJson = request.RoiConfigJson,

            CreatedAt = now
        };

        _context.FraudRecords.Add(record);

        if (job is not null)
        {
            job.Status = AnalysisJobStatus.Completed;
            job.FinishedAtUtc = now;
            job.UpdatedAtUtc = now;
            job.LastHeartbeatAtUtc = now;

            job.ErrorCode = null;
            job.ErrorMessage = null;
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Analysis result saved",
            jobId = job?.Id,
            transactionId = request.TransactionId,
            cameraId = job?.CameraId,
            riskLevel = request.RiskLevel,
            fraudScore = request.FraudScore,
            evidenceImageUrl = request.EvidenceImageUrl
        });
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory()
    {
        var records = await _context.FraudRecords
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

        return Ok(records);
    }

    [HttpGet("jobs")]
    public async Task<IActionResult> GetJobs()
    {
        var jobs = await _context.AnalysisJobs
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(100)
            .ToListAsync();

        return Ok(jobs);
    }

    [HttpGet("jobs/{jobId:guid}")]
    public async Task<IActionResult> GetJobById(Guid jobId)
    {
        var job = await _context.AnalysisJobs.FindAsync(jobId);

        if (job is null)
        {
            return NotFound(new
            {
                message = "Job not found",
                jobId
            });
        }

        return Ok(job);
    }
}