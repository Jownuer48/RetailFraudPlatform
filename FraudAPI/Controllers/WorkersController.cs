using FraudAPI.Data;
using FraudAPI.DTOs;
using FraudAPI.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WorkersController : ControllerBase
{
    private readonly AppDbContext _context;

    public WorkersController(AppDbContext context)
    {
        _context = context;
    }

    [HttpPost("heartbeat")]
    public async Task<IActionResult> ReceiveHeartbeat([FromBody] WorkerHeartbeatRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.WorkerId))
        {
            return BadRequest(new
            {
                message = "workerId is required"
            });
        }

        var now = DateTime.UtcNow;

        var worker = await _context.WorkerStatuses
            .FirstOrDefaultAsync(x => x.WorkerId == request.WorkerId);

        if (worker is null)
        {
            worker = new WorkerStatus
            {
                WorkerId = request.WorkerId,
                StartedAtUtc = now
            };

            _context.WorkerStatuses.Add(worker);
        }

        worker.Status = string.IsNullOrWhiteSpace(request.Status)
            ? "ONLINE"
            : request.Status;

        worker.CurrentJobId = request.CurrentJobId;
        worker.CurrentTransactionId = request.CurrentTransactionId;
        worker.CurrentCameraId = request.CurrentCameraId;

        if (request.ProcessedJobs.HasValue)
        {
            worker.ProcessedJobs = request.ProcessedJobs.Value;
        }

        if (request.FailedJobs.HasValue)
        {
            worker.FailedJobs = request.FailedJobs.Value;
        }

        worker.LastError = request.LastError;
        worker.LastSeenAtUtc = now;
        worker.UpdatedAtUtc = now;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Worker heartbeat received",
            worker.WorkerId,
            worker.Status,
            worker.LastSeenAtUtc
        });
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetWorkerStatuses()
    {
        var now = DateTime.UtcNow;
        var offlineCutoff = now.AddSeconds(-30);

        var workers = await _context.WorkerStatuses
            .OrderByDescending(x => x.LastSeenAtUtc)
            .ToListAsync();

        var result = workers.Select(worker =>
        {
            var isOffline = worker.LastSeenAtUtc < offlineCutoff;

            return new
            {
                worker.WorkerId,
                status = isOffline ? "OFFLINE" : worker.Status,
                worker.CurrentJobId,
                worker.CurrentTransactionId,
                worker.CurrentCameraId,
                worker.ProcessedJobs,
                worker.FailedJobs,
                worker.LastError,
                worker.StartedAtUtc,
                worker.LastSeenAtUtc,
                secondsSinceLastSeen = Math.Round((now - worker.LastSeenAtUtc).TotalSeconds, 1)
            };
        });

        return Ok(result);
    }

    [HttpDelete("offline")]
    public async Task<IActionResult> DeleteOfflineWorkers([FromQuery] int olderThanMinutes = 5)
    {
        if (olderThanMinutes < 1)
        {
            olderThanMinutes = 1;
        }

        if (olderThanMinutes > 1440)
        {
            olderThanMinutes = 1440;
        }

        var cutoff = DateTime.UtcNow.AddMinutes(-olderThanMinutes);

        var offlineWorkers = await _context.WorkerStatuses
            .Where(x => x.LastSeenAtUtc < cutoff)
            .ToListAsync();

        _context.WorkerStatuses.RemoveRange(offlineWorkers);

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Offline workers deleted",
            deletedCount = offlineWorkers.Count,
            olderThanMinutes
        });
    }
}