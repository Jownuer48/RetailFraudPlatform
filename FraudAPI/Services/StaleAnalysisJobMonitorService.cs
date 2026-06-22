using FraudAPI.Data;
using FraudAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace FraudAPI.Services;

public class StaleAnalysisJobMonitorService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<StaleAnalysisJobMonitorService> _logger;
    private readonly IConfiguration _configuration;

    public StaleAnalysisJobMonitorService(
        IServiceScopeFactory scopeFactory,
        ILogger<StaleAnalysisJobMonitorService> logger,
        IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var scanIntervalSeconds = _configuration.GetValue<int>(
            "AnalysisJobs:TimeoutScanIntervalSeconds",
            60
        );

        _logger.LogInformation(
            "StaleAnalysisJobMonitorService started. ScanInterval={ScanIntervalSeconds}s",
            scanIntervalSeconds
        );

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await MarkStaleJobsAsFailed(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while scanning stale analysis jobs");
            }

            await Task.Delay(
                TimeSpan.FromSeconds(scanIntervalSeconds),
                stoppingToken
            );
        }
    }

    private async Task MarkStaleJobsAsFailed(CancellationToken cancellationToken)
    {
        var timeoutMinutes = _configuration.GetValue<int>(
            "AnalysisJobs:ProcessingTimeoutMinutes",
            10
        );

        var now = DateTime.UtcNow;
        var cutoff = now.AddMinutes(-timeoutMinutes);

        using var scope = _scopeFactory.CreateScope();

        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var staleJobs = await context.AnalysisJobs
            .Where(x =>
                x.Status == AnalysisJobStatus.Processing &&
                (
                    x.LastHeartbeatAtUtc == null
                        ? x.UpdatedAtUtc < cutoff
                        : x.LastHeartbeatAtUtc < cutoff
                )
            )
            .OrderBy(x => x.UpdatedAtUtc)
            .Take(50)
            .ToListAsync(cancellationToken);

        if (staleJobs.Count == 0)
        {
            return;
        }

        foreach (var job in staleJobs)
        {
            var lastSeenAt = job.LastHeartbeatAtUtc ?? job.UpdatedAtUtc;

            job.Status = AnalysisJobStatus.Failed;
            job.ErrorCode = "JOB_TIMEOUT";
            job.ErrorMessage =
                $"Job timed out. Last worker heartbeat was at {lastSeenAt:O}. " +
                $"Timeout threshold is {timeoutMinutes} minutes.";

            job.FinishedAtUtc = now;
            job.UpdatedAtUtc = now;

            _logger.LogWarning(
                "Marked stale job as FAILED. JobId={JobId}, TransactionId={TransactionId}, LastSeenAt={LastSeenAt}",
                job.Id,
                job.TransactionId,
                lastSeenAt
            );
        }

        await context.SaveChangesAsync(cancellationToken);
    }
}