using FraudAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace FraudAPI.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<FraudRecord> FraudRecords => Set<FraudRecord>();

    public DbSet<AnalysisJob> AnalysisJobs => Set<AnalysisJob>();

    public DbSet<Camera> Cameras => Set<Camera>();

    public DbSet<WorkerStatus> WorkerStatuses => Set<WorkerStatus>();

    public DbSet<Store> Stores => Set<Store>();


    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);


        ConfigureAnalysisJob(modelBuilder);
        ConfigureCamera(modelBuilder);
        ConfigureWorkerStatus(modelBuilder);
        ConfigureStore(modelBuilder);

    }

    private static void ConfigureAnalysisJob(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AnalysisJob>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.Property(x => x.TransactionId)
                .HasMaxLength(100)
                .IsRequired();

            entity.Property(x => x.CameraId)
                .HasMaxLength(100);

            entity.HasIndex(x => x.CameraId);

            entity.Property(x => x.VideoPath)
                .HasMaxLength(1000)
                .IsRequired();

            entity.Property(x => x.Status)
                .HasMaxLength(32)
                .IsRequired();

            entity.Property(x => x.WorkerId)
                .HasMaxLength(100);

            entity.Property(x => x.ErrorCode)
                .HasMaxLength(100);

            entity.Property(x => x.ErrorMessage)
                .HasMaxLength(2000);

            entity.Property(x => x.RetryCount)
                .IsRequired();

            entity.Property(x => x.MaxRetryCount)
                .IsRequired();

            entity.HasIndex(x => x.LastHeartbeatAtUtc);
            entity.HasIndex(x => x.WorkerId);

            entity.HasIndex(x => x.TransactionId);
            entity.HasIndex(x => x.CameraId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.CreatedAtUtc);
        });
    }

    private static void ConfigureCamera(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Camera>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id)
                .HasMaxLength(100);

            entity.Property(x => x.StoreId)
                .HasMaxLength(100)
                .IsRequired();

            entity.Property(x => x.CameraName)
                .HasMaxLength(200)
                .IsRequired();

            entity.Property(x => x.SourceType)
                .HasMaxLength(50)
                .IsRequired();

            entity.Property(x => x.SourceUrl)
                .HasMaxLength(2000)
                .IsRequired();

            entity.Property(x => x.RoiConfigJson)
                .HasMaxLength(4000);

            entity.HasIndex(x => x.StoreId);
            entity.HasIndex(x => x.IsActive);

            entity.HasData(new Camera
            {
                Id = "CAM-COUNTER-01",
                StoreId = "STORE-001",
                CameraName = "Counter Camera",
                SourceType = "FILE",
                SourceUrl = "test_normal.mp4",
                RoiConfigJson = "[[150,150],[490,150],[490,480],[150,480]]",
                IsActive = true,
                CreatedAtUtc = new DateTime(2026, 6, 19, 0, 0, 0, DateTimeKind.Utc)
            });
        });
    }

    private static void ConfigureWorkerStatus(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WorkerStatus>(entity =>
        {
            entity.HasKey(x => x.WorkerId);

            entity.Property(x => x.WorkerId)
                .HasMaxLength(100);

            entity.Property(x => x.Status)
                .HasMaxLength(50)
                .IsRequired();

            entity.Property(x => x.CurrentTransactionId)
                .HasMaxLength(100);

            entity.Property(x => x.CurrentCameraId)
                .HasMaxLength(100);

            entity.Property(x => x.LastError)
                .HasMaxLength(2000);

            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.LastSeenAtUtc);
            entity.HasIndex(x => x.CurrentJobId);
        });
    }

    private static void ConfigureStore(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Store>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id)
                .HasMaxLength(100);

            entity.Property(x => x.StoreName)
                .HasMaxLength(200)
                .IsRequired();

            entity.Property(x => x.Region)
                .HasMaxLength(100);

            entity.Property(x => x.Address)
                .HasMaxLength(300);

            entity.HasIndex(x => x.Region);
            entity.HasIndex(x => x.IsActive);
        });
    }
}