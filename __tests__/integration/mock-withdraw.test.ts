describe('driver/mock-withdraw API route', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMockWithdrawalIds = process.env.MOCK_WITHDRAWAL_CLERK_IDS;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalMockWithdrawalIds === undefined) {
      delete process.env.MOCK_WITHDRAWAL_CLERK_IDS;
    } else {
      process.env.MOCK_WITHDRAWAL_CLERK_IDS = originalMockWithdrawalIds;
    }
  });

  it('allows an explicitly allowlisted test account to simulate a withdrawal in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MOCK_WITHDRAWAL_CLERK_IDS = 'clerk_driver';

    const insert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: 1, amount: 50, status: 'paid', is_mock: true },
          error: null,
        }),
      }),
    });

    const from = jest.fn((table: string) => {
      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      if (table === 'drivers') {
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: { id: 5 },
          error: null,
        });
      } else if (table === 'rides') {
        chain.lte = jest.fn().mockResolvedValue({
          data: [{ fare_price: 10000 }],
          error: null,
        });
      } else if (table === 'payouts') {
        chain.then = (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled);
        chain.insert = insert;
      }
      return chain;
    });

    jest.doMock('../../lib/server-auth', () => ({
      requireClerkUser: jest.fn().mockResolvedValue('clerk_driver'),
    }));
    jest.doMock('../../lib/supabase-server', () => ({
      getSupabaseServerClient: jest.fn().mockResolvedValue({ from }),
    }));

    const { POST } = require('../../app/(api)/driver/mock-withdraw+api');
    const request = new Request('https://example.com/api/driver/mock-withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clerkId: 'untrusted_id', amount: 50 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith({
      driver_id: 5,
      amount: 50,
      status: 'paid',
      bank_last4: null,
      is_mock: true,
    });
    expect(body.data.is_mock).toBe(true);
  });

  it('keeps production simulations disabled for accounts outside the allowlist', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MOCK_WITHDRAWAL_CLERK_IDS;

    const getSupabaseServerClient = jest.fn();
    jest.doMock('../../lib/server-auth', () => ({
      requireClerkUser: jest.fn().mockResolvedValue('clerk_driver'),
    }));
    jest.doMock('../../lib/supabase-server', () => ({
      getSupabaseServerClient,
    }));

    const { POST } = require('../../app/(api)/driver/mock-withdraw+api');
    const request = new Request('https://example.com/api/driver/mock-withdraw', {
      method: 'POST',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Mock withdrawals are disabled in production');
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
  });
});
