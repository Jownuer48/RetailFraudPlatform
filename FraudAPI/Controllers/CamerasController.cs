using System.Net.Sockets;
using FraudAPI.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CamerasController : ControllerBase
{
    private readonly AppDbContext _context;

    public CamerasController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetCameras()
    {
        var cameras = await _context.Cameras
            .Where(x => x.IsActive)
            .OrderBy(x => x.StoreId)
            .ThenBy(x => x.CameraName)
            .ToListAsync();

        return Ok(cameras);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetCameraById(string id)
    {
        var camera = await _context.Cameras
            .FirstOrDefaultAsync(x => x.Id == id && x.IsActive);

        if (camera is null)
        {
            return NotFound(new
            {
                message = "Camera not found",
                cameraId = id
            });
        }

        return Ok(camera);
    }

    [HttpGet("health")]
    public async Task<IActionResult> GetCameraHealth()
    {
        var cameras = await _context.Cameras
            .OrderBy(x => x.StoreId)
            .ThenBy(x => x.Id)
            .ToListAsync();

        var result = cameras.Select(camera => BuildCameraHealth(camera));

        return Ok(result);
    }

    [HttpPost("{id}/health-check")]
    public async Task<IActionResult> CheckCameraHealth(string id)
    {
        var camera = await _context.Cameras
            .FirstOrDefaultAsync(x => x.Id == id);

        if (camera is null)
        {
            return NotFound(new
            {
                message = $"Camera not found: {id}"
            });
        }

        return Ok(BuildCameraHealth(camera));
    }

    private object BuildCameraHealth(Models.Camera camera)
    {
        var now = DateTime.UtcNow;
        var sourceType = (camera.SourceType ?? "FILE").ToUpperInvariant();
        var sourceUrl = camera.SourceUrl ?? "";

        var isHealthy = false;
        var sourceStatus = "UNKNOWN";
        string? errorMessage = null;
        string? resolvedSource = null;

        if (!camera.IsActive)
        {
            return new
            {
                camera.Id,
                camera.StoreId,
                camera.CameraName,
                camera.SourceType,
                camera.SourceUrl,
                camera.IsActive,
                status = "OFFLINE",
                sourceStatus = "CAMERA_INACTIVE",
                isHealthy = false,
                resolvedSource,
                errorMessage = "Camera is inactive",
                lastCheckedAtUtc = now
            };
        }

        if (string.IsNullOrWhiteSpace(sourceUrl))
        {
            return new
            {
                camera.Id,
                camera.StoreId,
                camera.CameraName,
                camera.SourceType,
                camera.SourceUrl,
                camera.IsActive,
                status = "OFFLINE",
                sourceStatus = "SOURCE_NOT_CONFIGURED",
                isHealthy = false,
                resolvedSource,
                errorMessage = "SourceUrl is empty",
                lastCheckedAtUtc = now
            };
        }

        if (sourceType == "FILE")
        {
            resolvedSource = ResolveVideoFilePath(sourceUrl);

            if (System.IO.File.Exists(resolvedSource))
            {
                isHealthy = true;
                sourceStatus = "FILE_OK";
            }
            else
            {
                isHealthy = false;
                sourceStatus = "FILE_NOT_FOUND";
                errorMessage = $"Video file not found: {resolvedSource}";
            }
        }
        else if (sourceType == "RTSP")
        {
            var rtspResult = CheckRtspTcp(sourceUrl);

            isHealthy = rtspResult.isReachable;
            sourceStatus = rtspResult.isReachable
                ? "RTSP_REACHABLE"
                : "RTSP_UNREACHABLE";

            errorMessage = rtspResult.errorMessage;
            resolvedSource = sourceUrl;
        }
        else
        {
            isHealthy = false;
            sourceStatus = "UNSUPPORTED_SOURCE_TYPE";
            errorMessage = $"Unsupported source type: {sourceType}";
            resolvedSource = sourceUrl;
        }

        return new
        {
            camera.Id,
            camera.StoreId,
            camera.CameraName,
            camera.SourceType,
            camera.SourceUrl,
            camera.IsActive,
            status = isHealthy ? "ONLINE" : "OFFLINE",
            sourceStatus,
            isHealthy,
            resolvedSource,
            errorMessage,
            lastCheckedAtUtc = now
        };
    }

    private static string ResolveVideoFilePath(string sourceUrl)
    {
        if (Path.IsPathRooted(sourceUrl))
        {
            return Path.GetFullPath(sourceUrl);
        }

        var fraudApiDir = Directory.GetCurrentDirectory();
        var projectRoot = Directory.GetParent(fraudApiDir)?.FullName ?? fraudApiDir;

        return Path.GetFullPath(
            Path.Combine(projectRoot, "FraudAI", sourceUrl)
        );
    }

    private static (bool isReachable, string? errorMessage) CheckRtspTcp(string sourceUrl)
    {
        try
        {
            if (!Uri.TryCreate(sourceUrl, UriKind.Absolute, out var uri))
            {
                return (false, "Invalid RTSP URL");
            }

            var host = uri.Host;
            var port = uri.Port > 0 ? uri.Port : 554;

            using var client = new TcpClient();

            var connectTask = client.ConnectAsync(host, port);
            var completedTask = Task.WhenAny(connectTask, Task.Delay(1500)).GetAwaiter().GetResult();

            if (completedTask != connectTask)
            {
                return (false, $"RTSP connection timeout: {host}:{port}");
            }

            connectTask.GetAwaiter().GetResult();

            return (client.Connected, client.Connected ? null : $"RTSP unreachable: {host}:{port}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }
}