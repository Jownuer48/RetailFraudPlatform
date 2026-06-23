using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FraudAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkerHealthMonitoring : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorkerStatuses",
                columns: table => new
                {
                    WorkerId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CurrentJobId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CurrentTransactionId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CurrentCameraId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ProcessedJobs = table.Column<int>(type: "int", nullable: false),
                    FailedJobs = table.Column<int>(type: "int", nullable: false),
                    LastError = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    StartedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastSeenAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkerStatuses", x => x.WorkerId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkerStatuses_CurrentJobId",
                table: "WorkerStatuses",
                column: "CurrentJobId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkerStatuses_LastSeenAtUtc",
                table: "WorkerStatuses",
                column: "LastSeenAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_WorkerStatuses_Status",
                table: "WorkerStatuses",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WorkerStatuses");
        }
    }
}
