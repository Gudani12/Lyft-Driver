describe('driver/earnings API route', () => {
  const setupSupabase = (mockImpl: any) => {
    jest.doMock('../../lib/supabase-server', () => ({
      getSupabaseServerClient: jest.fn().mockResolvedValue(mockImpl),
    }));
  };

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('INT-EARN-01: GET returns 400 when clerkId is missing', async () => {
    setupSupabase({ from: jest.fn() });
    const { GET } = require('../../app/(api)/driver/earnings+api');
    const request = new Request('https://example.com/api/driver/earnings', {
      method: 'GET',
    });
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('INT-EARN-02: GET returns zero summary when no driver record exists', async () => {
    const from = jest.fn((table: string) => {
      if (table === 'users') {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        return chain;
      }
      if (table === 'drivers') {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        return chain;
      }
      return { select: jest.fn().mockReturnThis() };
    });

    setupSupabase({ from });

    const { GET } = require('../../app/(api)/driver/earnings+api');
    const request = new Request(
      'https://example.com/api/driver/earnings?clerkId=clerk_new',
      { method: 'GET' },
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.summary.available).toBe(0);
    expect(body.data.summary.lifetime).toBe(0);
    expect(body.data.summary.withdrawal_mode).toBe('simulation');
    expect(body.data.payouts).toEqual([]);
  });

  it('reports request withdrawals when the API runs in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousMockWithdrawalIds = process.env.MOCK_WITHDRAWAL_CLERK_IDS;
    process.env.NODE_ENV = 'production';
    delete process.env.MOCK_WITHDRAWAL_CLERK_IDS;

    try {
      const from = jest.fn(() => {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: null,
          error: null,
        });
        return chain;
      });

      setupSupabase({ from });

      const { GET } = require('../../app/(api)/driver/earnings+api');
      const request = new Request(
        'https://example.com/api/driver/earnings?clerkId=clerk_new',
        { method: 'GET' },
      );
      const response = await GET(request);
      const body = await response.json();

      expect(body.data.summary.withdrawal_mode).toBe('request');
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousMockWithdrawalIds === undefined) {
        delete process.env.MOCK_WITHDRAWAL_CLERK_IDS;
      } else {
        process.env.MOCK_WITHDRAWAL_CLERK_IDS = previousMockWithdrawalIds;
      }
    }
  });

  it('reports simulations only for allowlisted test users in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousMockWithdrawalIds = process.env.MOCK_WITHDRAWAL_CLERK_IDS;
    process.env.NODE_ENV = 'production';
    process.env.MOCK_WITHDRAWAL_CLERK_IDS = 'clerk_test, clerk_driver';

    try {
      const from = jest.fn(() => {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: null,
          error: null,
        });
        return chain;
      });

      setupSupabase({ from });

      const { GET } = require('../../app/(api)/driver/earnings+api');
      const request = new Request(
        'https://example.com/api/driver/earnings?clerkId=clerk_driver',
        { method: 'GET' },
      );
      const response = await GET(request);
      const body = await response.json();

      expect(body.data.summary.withdrawal_mode).toBe('simulation');
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousMockWithdrawalIds === undefined) {
        delete process.env.MOCK_WITHDRAWAL_CLERK_IDS;
      } else {
        process.env.MOCK_WITHDRAWAL_CLERK_IDS = previousMockWithdrawalIds;
      }
    }
  });

  it('INT-EARN-03: GET computes earnings from completed rides minus payouts', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const from = jest.fn((table: string) => {
      if (table === 'users') {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: { profile_data: { bank_account: { last4: '4242' } } },
          error: null,
        });
        return chain;
      }
      if (table === 'drivers') {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: { id: 5 },
          error: null,
        });
        return chain;
      }
      if (table === 'rides') {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.then = (onFulfilled: any) =>
          Promise.resolve({
            data: [
              { fare_price: 5000, completed_at: '2026-09-20T10:00:00.000Z' },
              { fare_price: 3000, completed_at: '2026-09-21T10:00:00.000Z' },
            ],
            error: null,
          }).then(onFulfilled);
        return chain;
      }
      if (table === 'payouts') {
        const chain: any = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockReturnValue(chain);
        chain.then = (onFulfilled: any) =>
          Promise.resolve({
            data: [
              { id: 1, amount: 20, status: 'paid', created_at: '2026-09-22', bank_last4: '4242' },
            ],
            error: null,
          }).then(onFulfilled);
        return chain;
      }
      return { select: jest.fn().mockReturnThis() };
    });

    setupSupabase({ from });

    const { GET } = require('../../app/(api)/driver/earnings+api');
    const request = new Request(
      'https://example.com/api/driver/earnings?clerkId=clerk_driver',
      { method: 'GET' },
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    // Two rides: 5000c + 3000c = 8000c gross -> 80 R gross -> 72 R net (10% commission)
    expect(body.data.summary.lifetime).toBeCloseTo(72, 1);
    expect(body.data.summary.bank_account_last4).toBe('4242');

    errorSpy.mockRestore();
  });
});