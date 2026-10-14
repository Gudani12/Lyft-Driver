describe('profile API route', () => {
  const setupSupabase = (mockImpl: any) => {
    jest.doMock('../../lib/supabase-server', () => ({
      getSupabaseServerClient: jest.fn().mockResolvedValue(mockImpl),
    }));
  };

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('INT-PROFILE-01: GET returns 400 when clerkId is missing', async () => {
    setupSupabase({ from: jest.fn() });
    const { GET } = require('../../app/(api)/profile+api');
    const request = new Request('https://example.com/api/profile', { method: 'GET' });
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('INT-PROFILE-02: GET returns null data when driver does not exist', async () => {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

    setupSupabase({ from: jest.fn(() => chain) });

    const { GET } = require('../../app/(api)/profile+api');
    const request = new Request(
      'https://example.com/api/profile?clerkId=clerk_new',
      { method: 'GET' },
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeNull();
  });

  it('INT-PROFILE-03: POST returns 400 when clerkId is missing from body', async () => {
    setupSupabase({ from: jest.fn() });

    const { POST } = require('../../app/(api)/profile+api');
    const request = new Request('https://example.com/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Sipho Dlamini' }), // no clerkId
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('INT-PROFILE-04: POST saves a full name to all driver name fields', async () => {
    const update = jest.fn();
    const chain: any = {};
    chain.update = jest.fn((payload) => {
      update(payload);
      return chain;
    });
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({
      data: {
        clerk_id: 'clerk_driver',
        first_name: 'Sipho',
        last_name: 'Dlamini',
        full_name: 'Sipho Dlamini',
      },
      error: null,
    });

    setupSupabase({ from: jest.fn(() => chain) });

    const { POST } = require('../../app/(api)/profile+api');
    const request = new Request('https://example.com/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clerkId: 'clerk_driver',
        full_name: 'Sipho Dlamini',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      full_name: 'Sipho Dlamini',
      first_name: 'Sipho',
      last_name: 'Dlamini',
    });
  });

  it('INT-PROFILE-05: GET builds the displayed name from first and last name', async () => {
    const profile = {
      id: 'driver_1',
      clerk_id: 'clerk_driver',
      first_name: 'Sipho',
      last_name: 'Dlamini',
      full_name: null,
      profile_data: {},
      rating: 5,
    };
    const driverChain: any = {};
    driverChain.select = jest.fn().mockReturnValue(driverChain);
    driverChain.eq = jest.fn().mockReturnValue(driverChain);
    driverChain.maybeSingle = jest.fn().mockResolvedValue({
      data: profile,
      error: null,
    });

    const vehicleChain: any = {};
    vehicleChain.select = jest.fn().mockReturnValue(vehicleChain);
    vehicleChain.eq = jest.fn().mockReturnValue(vehicleChain);
    vehicleChain.maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    const ratingsChain: any = {};
    ratingsChain.select = jest.fn().mockReturnValue(ratingsChain);
    ratingsChain.eq = jest.fn().mockResolvedValue({ data: [], error: null });

    setupSupabase({
      from: jest.fn((table: string) => {
        if (table === 'drivers') return driverChain;
        if (table === 'driver_vehicles') return vehicleChain;
        return ratingsChain;
      }),
    });

    const { GET } = require('../../app/(api)/profile+api');
    const request = new Request(
      'https://example.com/api/profile?clerkId=clerk_driver',
      { method: 'GET' },
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.name).toBe('Sipho Dlamini');
  });
});