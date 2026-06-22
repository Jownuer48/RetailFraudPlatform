namespace FraudAPI.DTOs;

public sealed record ReviewFraudRecordRequest(
    string ReviewStatus,
    string? ReviewedBy,
    string? ReviewNote
);