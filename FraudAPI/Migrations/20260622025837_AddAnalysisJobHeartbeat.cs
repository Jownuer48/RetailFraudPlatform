using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FraudAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddAnalysisJobHeartbeat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ErrorCode",
                table: "AnalysisJobs",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastHeartbeatAtUtc",
                table: "AnalysisJobs",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxRetryCount",
                table: "AnalysisJobs",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "WorkerId",
                table: "AnalysisJobs",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AnalysisJobs_LastHeartbeatAtUtc",
                table: "AnalysisJobs",
                column: "LastHeartbeatAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_AnalysisJobs_WorkerId",
                table: "AnalysisJobs",
                column: "WorkerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AnalysisJobs_LastHeartbeatAtUtc",
                table: "AnalysisJobs");

            migrationBuilder.DropIndex(
                name: "IX_AnalysisJobs_WorkerId",
                table: "AnalysisJobs");

            migrationBuilder.DropColumn(
                name: "ErrorCode",
                table: "AnalysisJobs");

            migrationBuilder.DropColumn(
                name: "LastHeartbeatAtUtc",
                table: "AnalysisJobs");

            migrationBuilder.DropColumn(
                name: "MaxRetryCount",
                table: "AnalysisJobs");

            migrationBuilder.DropColumn(
                name: "WorkerId",
                table: "AnalysisJobs");
        }
    }
}
