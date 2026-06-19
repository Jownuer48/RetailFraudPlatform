using FraudAPI.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CamerasController : ControllerBase
{
    private readonly AppDbContext _context;

    public CamerasController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetCameras()
    {
        var cameras = await _context.Cameras
            .Where(x => x.IsActive)
            .OrderBy(x => x.StoreId)
            .ThenBy(x => x.CameraName)
            .ToListAsync();

        return Ok(cameras);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetCameraById(string id)
    {
        var camera = await _context.Cameras
            .FirstOrDefaultAsync(x => x.Id == id && x.IsActive);

        if (camera is null)
        {
            return NotFound(new
            {
                message = "Camera not found",
                cameraId = id
            });
        }

        return Ok(camera);
    }
}