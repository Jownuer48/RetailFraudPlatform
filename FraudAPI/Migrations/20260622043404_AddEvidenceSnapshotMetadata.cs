using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FraudAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddEvidenceSnapshotMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CameraId",
                table: "FraudRecords",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EvidenceFrameNumber",
                table: "FraudRecords",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EvidenceImagePath",
                table: "FraudRecords",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EvidenceImageUrl",
                table: "FraudRecords",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RoiConfigJson",
                table: "FraudRecords",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceType",
                table: "FraudRecords",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CameraId",
                table: "FraudRecords");

            migrationBuilder.DropColumn(
                name: "EvidenceFrameNumber",
                table: "FraudRecords");

            migrationBuilder.DropColumn(
                name: "EvidenceImagePath",
                table: "FraudRecords");

            migrationBuilder.DropColumn(
                name: "EvidenceImageUrl",
                table: "FraudRecords");

            migrationBuilder.DropColumn(
                name: "RoiConfigJson",
                table: "FraudRecords");

            migrationBuilder.DropColumn(
                name: "SourceType",
                table: "FraudRecords");
        }
    }
}
