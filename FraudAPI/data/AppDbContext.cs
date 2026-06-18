using FraudAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace FraudAPI.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<FraudRecord> FraudRecords { get; set; }
    }
}