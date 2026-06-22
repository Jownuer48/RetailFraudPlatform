using FraudAPI.Data;
using FraudAPI.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// --- 1. Database ---
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// --- 2. Services ---
builder.Services.AddHttpClient<AiAnalysisService>();

builder.Services.AddSingleton<RabbitMQService>();
builder.Services.AddHostedService<StaleAnalysisJobMonitorService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// --- 3. CORS ---
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        policy => policy.AllowAnyOrigin()
                        .AllowAnyMethod()
                        .AllowAnyHeader());
});

// ==========================================
// ห้ามเอา builder.Services... มาวางใต้บรรทัดนี้
var app = builder.Build();
// ==========================================

// --- 4. Middleware ---
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAll");

app.UseHttpsRedirection();

// สำคัญ: เปิดให้ Backend serve รูป evidence จาก wwwroot/evidence/images
app.UseStaticFiles();

app.MapControllers();

app.Run();