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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AnalysisJob>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.Property(x => x.TransactionId)
                .HasMaxLength(100)
                .IsRequired();

            entity.Property(x => x.VideoPath)
                .HasMaxLength(1000)
                .IsRequired();

            entity.Property(x => x.Status)
                .HasMaxLength(32)
                .IsRequired();

            entity.Property(x => x.ErrorMessage)
                .HasMaxLength(2000);

            entity.HasIndex(x => x.TransactionId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.CreatedAtUtc);
        });
    }
}