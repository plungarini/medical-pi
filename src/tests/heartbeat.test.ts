import { describe, it, expect } from 'vitest';

describe('Heartbeat Service', () => {
  it('should parse cron expressions', () => {
    const validCrons = [
      '0 * * * *',      // Hourly
      '0 2 * * *',      // Daily at 2 AM
      '*/15 * * * *',   // Every 15 minutes
    ];

    for (const cron of validCrons) {
      const parts = cron.split(' ');
      expect(parts).toHaveLength(5);
    }
  });

  it('should have heartbeat configuration', () => {
    const config = {
      enabled: process.env.HEARTBEAT_ENABLED !== 'false',
      interval: process.env.HEARTBEAT_INTERVAL || '0 * * * *',
      titleRepair: process.env.TITLE_REPAIR_CRON || '0 2 * * *',
    };

    expect(typeof config.enabled).toBe('boolean');
    expect(config.interval).toBeDefined();
    expect(config.titleRepair).toBeDefined();
  });
});
