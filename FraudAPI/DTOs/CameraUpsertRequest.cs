namespace FraudAPI.DTOs;

public sealed record CameraUpsertRequest(
    string Id,
    string StoreId,
    string CameraName,
    string SourceType,
    string SourceUrl,
    string? RoiConfigJson,
    bool IsActive
);