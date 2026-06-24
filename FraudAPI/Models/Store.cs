using System.ComponentModel.DataAnnotations;

namespace FraudAPI.Models;

public class Store
{
    [Key]
    [MaxLength(100)]
    public string Id { get; set; } = string.Empty;

    [MaxLength(200)]
    public string StoreName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Region { get; set; }

    [MaxLength(300)]
    public string? Address { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}