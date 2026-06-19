using System.ComponentModel.DataAnnotations;

namespace FraudAPI.Models;

public class Camera
{
    [Key]
    [MaxLength(100)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string StoreId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string CameraName { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string SourceType { get; set; } = "FILE"; 
    // FILE, RTSP

    [Required]
    [MaxLength(2000)]
    public string SourceUrl { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? RoiConfigJson { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}