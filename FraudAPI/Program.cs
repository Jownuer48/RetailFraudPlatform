using FraudAPI.Data;
using FraudAPI.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// --- 1. ตั้งค่า Database ต้องอยู่ "ก่อน" builder.Build() ---
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// --- 2. ลงทะเบียน Service ต่างๆ ---
builder.Services.AddHttpClient<AiAnalysisService>();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// เพิ่มชุดนี้เข้าไป
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        builder => builder.AllowAnyOrigin()
                          .AllowAnyMethod()
                          .AllowAnyHeader());
});

// ==========================================
// ห้ามเอา builder.Services... มาวางใต้บรรทัดนี้เด็ดขาด!
var app = builder.Build();
// ==========================================

// --- 3. ตั้งค่าการทำงานของแอป ---
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAll"); 

app.UseHttpsRedirection();
app.MapControllers(); 

app.Run();