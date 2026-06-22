using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FraudAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddEvidenceClipMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "EvidenceClipEndSec",
                table: "FraudRecords",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "EvidenceClipStartSec",
                table: "FraudRecords",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EvidenceVideoPath",
                table: "FraudRecords",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EvidenceVideoUrl",
                table: "FraudRecords",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EvidenceClipEndSec",
                table: "FraudRecords");

            migrationBuilder.DropColumn(
                name: "EvidenceClipStartSec",
                table: "FraudRecords");

            migrationBuilder.DropColumn(
                name: "EvidenceVideoPath",
                table: "FraudRecords");

            migrationBuilder.DropColumn(
                name: "EvidenceVideoUrl",
                table: "FraudRecords");
        }
    }
}
