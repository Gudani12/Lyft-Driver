describe('ride status API route', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('treats starting an already in-progress ride as successful', async () => {
    const update = jest.fn();
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
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: {
            ride_id: 'ride_1',
            driver_id: 5,
            user_id: 'passenger_1',
            status: 'in_progress',
          },
          error: null,
        });
        chain.update = update;
      }
      return chain;
    });

    jest.doMock('../../lib/server-auth', () => ({
      requireClerkUser: jest.fn().mockResolvedValue('clerk_driver'),
    }));
    jest.doMock('../../lib/supabase-server', () => ({
      getSupabaseServerClient: jest.fn().mockResolvedValue({ from }),
    }));

    const { PATCH } = require('../../app/(api)/ride/[id]+api');
    const request = new Request('https://example.com/api/ride/ride_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });

    const response = await PATCH(request, { id: 'ride_1' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('in_progress');
    expect(update).not.toHaveBeenCalled();
  });
});
