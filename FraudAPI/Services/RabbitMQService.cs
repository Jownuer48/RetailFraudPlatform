using System.Text;
using System.Text.Json;
using FraudAPI.DTOs;
using RabbitMQ.Client;

namespace FraudAPI.Services;

public class RabbitMQService : IDisposable
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<RabbitMQService> _logger;

    private readonly string _host;
    private readonly int _port;
    private readonly string _username;
    private readonly string _password;
    private readonly string _queueName;

    private readonly object _lock = new();

    private readonly object _channelLock = new();

    private IConnection? _connection;
    private IModel? _channel;

    public RabbitMQService(
        IConfiguration configuration,
        ILogger<RabbitMQService> logger)
    {
        _configuration = configuration;
        _logger = logger;

        _host = _configuration["RabbitMq:Host"] ?? "localhost";
        _port = int.Parse(_configuration["RabbitMq:Port"] ?? "5673");
        _username = _configuration["RabbitMq:Username"] ?? "fraud_user";
        _password = _configuration["RabbitMq:Password"] ?? "fraud_pass_2026";
        _queueName = _configuration["RabbitMq:QueueName"] ?? "fraud_queue";
    }

    public void PublishAnalysisJob(AnalysisJobMessage message)
    {
        lock (_lock)
        {
            var channel = GetOrCreateChannel();

            var json = JsonSerializer.Serialize(
                message,
                new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                }
            );

            var body = Encoding.UTF8.GetBytes(json);

            var properties = channel.CreateBasicProperties();
            properties.Persistent = true;
            properties.ContentType = "application/json";
            properties.MessageId = message.JobId.ToString();
            properties.Type = "fraud.analysis.request";
            properties.Timestamp = new AmqpTimestamp(DateTimeOffset.UtcNow.ToUnixTimeSeconds());

            channel.BasicPublish(
                exchange: "",
                routingKey: _queueName,
                mandatory: true,
                basicProperties: properties,
                body: body
            );

            channel.WaitForConfirmsOrDie(TimeSpan.FromSeconds(5));

            _logger.LogInformation(
                "Published analysis job to RabbitMQ. JobId={JobId}, TransactionId={TransactionId}",
                message.JobId,
                message.TransactionId
            );
        }
    }

    private IModel GetOrCreateChannel()
    {
        if (_connection is null || !_connection.IsOpen)
        {
            var factory = new ConnectionFactory
            {
                HostName = _host,
                Port = _port,
                UserName = _username,
                Password = _password,
                DispatchConsumersAsync = false,
                AutomaticRecoveryEnabled = true,
                NetworkRecoveryInterval = TimeSpan.FromSeconds(10)
            };

            _connection = factory.CreateConnection();
        }

        if (_channel is null || !_channel.IsOpen)
        {
            _channel = _connection.CreateModel();

            var failedQueueName = _configuration["RabbitMq:FailedQueueName"]
    ?? "fraud_failed_queue";

            var deadLetterExchange = _configuration["RabbitMq:DeadLetterExchange"]
                ?? "fraud_dlx";

            _channel.ExchangeDeclare(
                exchange: deadLetterExchange,
                type: ExchangeType.Direct,
                durable: true,
                autoDelete: false
            );

            _channel.QueueDeclare(
                queue: failedQueueName,
                durable: true,
                exclusive: false,
                autoDelete: false,
                arguments: null
            );

            _channel.QueueBind(
                queue: failedQueueName,
                exchange: deadLetterExchange,
                routingKey: failedQueueName
            );

            var queueArguments = new Dictionary<string, object>
            {
                ["x-dead-letter-exchange"] = deadLetterExchange,
                ["x-dead-letter-routing-key"] = failedQueueName
            };

            _channel.QueueDeclare(
                queue: _queueName,
                durable: true,
                exclusive: false,
                autoDelete: false,
                arguments: queueArguments
            );

            _channel.ConfirmSelect();
        }

        return _channel;
    }

    public void Dispose()
    {
        try
        {
            _channel?.Close();
            _channel?.Dispose();

            _connection?.Close();
            _connection?.Dispose();
        }
        catch
        {
            // Ignore dispose errors
        }
    }

    private void EnsureRabbitMqReady()
    {
        if (_connection is { IsOpen: true } && _channel is { IsOpen: true })
        {
            return;
        }

        var host = _configuration["RabbitMq:Host"] ?? "localhost";
        var port = int.Parse(_configuration["RabbitMq:Port"] ?? "5673");
        var username = _configuration["RabbitMq:Username"] ?? "fraud_user";
        var password = _configuration["RabbitMq:Password"] ?? "fraud_pass_2026";

        var queueName = _configuration["RabbitMq:QueueName"] ?? "fraud_queue";
        var failedQueueName = _configuration["RabbitMq:FailedQueueName"] ?? "fraud_failed_queue";
        var deadLetterExchange = _configuration["RabbitMq:DeadLetterExchange"] ?? "fraud_dlx";

        var factory = new ConnectionFactory
        {
            HostName = host,
            Port = port,
            UserName = username,
            Password = password
        };

        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        _channel.ExchangeDeclare(
            exchange: deadLetterExchange,
            type: ExchangeType.Direct,
            durable: true,
            autoDelete: false
        );

        _channel.QueueDeclare(
            queue: failedQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null
        );

        _channel.QueueBind(
            queue: failedQueueName,
            exchange: deadLetterExchange,
            routingKey: failedQueueName
        );

        var queueArguments = new Dictionary<string, object>
        {
            ["x-dead-letter-exchange"] = deadLetterExchange,
            ["x-dead-letter-routing-key"] = failedQueueName
        };

        _channel.QueueDeclare(
            queue: queueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: queueArguments
        );
    }

    public uint GetQueueMessageCount(string queueName)
    {
        lock (_channelLock)
        {
            EnsureRabbitMqReady();

            if (_channel is null)
            {
                throw new InvalidOperationException("RabbitMQ channel is not initialized.");
            }

            var result = _channel.QueueDeclarePassive(queueName);
            return result.MessageCount;
        }
    }

    public object GetQueueSummary()
    {
        var mainQueueName = _configuration["RabbitMq:QueueName"] ?? "fraud_queue";
        var failedQueueName = _configuration["RabbitMq:FailedQueueName"] ?? "fraud_failed_queue";

        return new
        {
            mainQueue = new
            {
                name = mainQueueName,
                messageCount = GetQueueMessageCount(mainQueueName)
            },
            failedQueue = new
            {
                name = failedQueueName,
                messageCount = GetQueueMessageCount(failedQueueName)
            }
        };
    }

    public int RequeueFailedMessages(int maxMessages = 10)
    {
        var mainQueueName = _configuration["RabbitMq:QueueName"] ?? "fraud_queue";
        var failedQueueName = _configuration["RabbitMq:FailedQueueName"] ?? "fraud_failed_queue";

        if (maxMessages <= 0)
        {
            maxMessages = 1;
        }

        if (maxMessages > 100)
        {
            maxMessages = 100;
        }

        var movedCount = 0;

        lock (_channelLock)
        {
            EnsureRabbitMqReady();

            if (_channel is null)
            {
                throw new InvalidOperationException("RabbitMQ channel is not initialized.");
            }

            for (var i = 0; i < maxMessages; i++)
            {
                var message = _channel.BasicGet(
                    queue: failedQueueName,
                    autoAck: false
                );

                if (message is null)
                {
                    break;
                }

                var properties = _channel.CreateBasicProperties();
                properties.Persistent = true;
                properties.ContentType = "application/json";

                _channel.BasicPublish(
                    exchange: string.Empty,
                    routingKey: mainQueueName,
                    basicProperties: properties,
                    body: message.Body
                );

                _channel.BasicAck(
                    deliveryTag: message.DeliveryTag,
                    multiple: false
                );

                movedCount++;
            }
        }

        return movedCount;
    }
}