using System.Text;
using System.Text.Json;
using FraudAPI.Models;

namespace FraudAPI.Services
{
    public class AiAnalysisService
    {
        private readonly HttpClient _httpClient;
        private readonly string _aiServiceUrl = "http://127.0.0.1:8000/api/analyze";

        public AiAnalysisService(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        public async Task<FraudRecord?> AnalyzeVideoAsync(string transactionId, string videoPath)
        {
            // 1. แพ็คข้อมูลเป็น JSON เตรียมยิงเข้า Python
            var requestBody = new 
            { 
                transaction_id = transactionId, 
                video_path = videoPath 
            };
            
            var jsonContent = new StringContent(
                JsonSerializer.Serialize(requestBody), 
                Encoding.UTF8, 
                "application/json"
            );

            try
            {
                // 2. ส่งคำสั่ง POST ไปยัง Python API
                var response = await _httpClient.PostAsync(_aiServiceUrl, jsonContent);
                response.EnsureSuccessStatusCode();

                // 3. อ่านและแปลงผลลัพธ์ JSON กลับมาเป็น Object ของ C#
                var responseString = await response.Content.ReadAsStringAsync();
                
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var aiResult = JsonSerializer.Deserialize<FraudRecord>(responseString, options);

                return aiResult;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AI Service Error]: {ex.Message}");
                return null;
            }
        }
    }
}