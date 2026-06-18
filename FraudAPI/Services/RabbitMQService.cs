using RabbitMQ.Client;
using System.Text;
using System.Text.Json;
using System;
using Microsoft.Extensions.Configuration; // <-- เพิ่มตัวนี้เข้ามา

namespace FraudAPI.Services
{
    public class RabbitMQService
    {
        private readonly IConfiguration _config;

        // รับค่า IConfiguration เข้ามาทาง Constructor
        public RabbitMQService(IConfiguration config)
        {
            _config = config;
        }

        public void SendMessage(string transactionId, string videoPath)
        {
            // ดึงค่ามาจาก appsettings.json
            var host = _config["RabbitMq:Host"];
            var port = int.Parse(_config["RabbitMq:Port"] ?? "5672");
            var username = _config["RabbitMq:Username"];
            var password = _config["RabbitMq:Password"];
            var queueName = _config["RabbitMq:QueueName"] ?? "fraud_queue";

            var factory = new ConnectionFactory() 
            { 
                HostName = host,
                Port = port,
                UserName = username,
                Password = password
            };
            
            using var connection = factory.CreateConnection();
            using var channel = connection.CreateModel();

            // ใช้ชื่อคิวตามที่ตั้งไว้ใน Config
            channel.QueueDeclare(queue: queueName, durable: true, exclusive: false, autoDelete: false);

            var message = new { transactionId, videoPath };
            var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message));

            channel.BasicPublish(exchange: "", routingKey: queueName, basicProperties: null, body: body);
            Console.WriteLine($" [x] ฝากงานให้ AI แล้ว: {transactionId}");
        }
    }
}