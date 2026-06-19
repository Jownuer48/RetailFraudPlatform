using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FraudAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddCameraRegistry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CameraId",
                table: "AnalysisJobs",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Cameras",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    StoreId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CameraName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SourceType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    SourceUrl = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    RoiConfigJson = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cameras", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "Cameras",
                columns: new[] { "Id", "CameraName", "CreatedAtUtc", "IsActive", "RoiConfigJson", "SourceType", "SourceUrl", "StoreId" },
                values: new object[] { "CAM-COUNTER-01", "Counter Camera", new DateTime(2026, 6, 19, 0, 0, 0, 0, DateTimeKind.Utc), true, "[[150,150],[490,150],[490,480],[150,480]]", "FILE", "test_normal.mp4", "STORE-001" });

            migrationBuilder.CreateIndex(
                name: "IX_AnalysisJobs_CameraId",
                table: "AnalysisJobs",
                column: "CameraId");

            migrationBuilder.CreateIndex(
                name: "IX_Cameras_IsActive",
                table: "Cameras",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_Cameras_StoreId",
                table: "Cameras",
                column: "StoreId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Cameras");

            migrationBuilder.DropIndex(
                name: "IX_AnalysisJobs_CameraId",
                table: "AnalysisJobs");

            migrationBuilder.DropColumn(
                name: "CameraId",
                table: "AnalysisJobs");
        }
    }
}
