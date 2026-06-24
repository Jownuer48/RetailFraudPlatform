using FraudAPI.Data;
using FraudAPI.DTOs;
using FraudAPI.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FraudAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class StoresController : ControllerBase
{
    private readonly AppDbContext _context;

    public StoresController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetStores()
    {
        var stores = await _context.Stores
            .OrderBy(x => x.Id)
            .ToListAsync();

        return Ok(stores);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetStoreById(string id)
    {
        var store = await _context.Stores
            .FirstOrDefaultAsync(x => x.Id == id);

        if (store is null)
        {
            return NotFound(new
            {
                message = $"Store not found: {id}"
            });
        }

        return Ok(store);
    }

    [HttpPost]
    public async Task<IActionResult> CreateStore([FromBody] StoreUpsertRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Id))
        {
            return BadRequest(new { message = "Store id is required" });
        }

        if (string.IsNullOrWhiteSpace(request.StoreName))
        {
            return BadRequest(new { message = "Store name is required" });
        }

        var normalizedId = request.Id.Trim();

        var exists = await _context.Stores.AnyAsync(x => x.Id == normalizedId);

        if (exists)
        {
            return Conflict(new
            {
                message = $"Store already exists: {normalizedId}"
            });
        }

        var store = new Store
        {
            Id = normalizedId,
            StoreName = request.StoreName.Trim(),
            Region = request.Region?.Trim(),
            Address = request.Address?.Trim(),
            IsActive = request.IsActive,
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.Stores.Add(store);

        await _context.SaveChangesAsync();

        return Ok(store);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateStore(
        string id,
        [FromBody] StoreUpsertRequest request)
    {
        var store = await _context.Stores.FirstOrDefaultAsync(x => x.Id == id);

        if (store is null)
        {
            return NotFound(new
            {
                message = $"Store not found: {id}"
            });
        }

        if (string.IsNullOrWhiteSpace(request.StoreName))
        {
            return BadRequest(new { message = "Store name is required" });
        }

        store.StoreName = request.StoreName.Trim();
        store.Region = request.Region?.Trim();
        store.Address = request.Address?.Trim();
        store.IsActive = request.IsActive;

        await _context.SaveChangesAsync();

        return Ok(store);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteStore(string id)
    {
        var store = await _context.Stores.FirstOrDefaultAsync(x => x.Id == id);

        if (store is null)
        {
            return NotFound(new
            {
                message = $"Store not found: {id}"
            });
        }

        var cameraCount = await _context.Cameras
            .CountAsync(x => x.StoreId == id);

        if (cameraCount > 0)
        {
            return BadRequest(new
            {
                message = $"Cannot delete store because {cameraCount} camera(s) are using it."
            });
        }

        _context.Stores.Remove(store);

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Store deleted",
            id
        });
    }
}