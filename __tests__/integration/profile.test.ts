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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    const driverQuery: any = {};
    driverQuery.select = jest.fn().mockReturnValue(driverQuery);
    driverQuery.eq = jest.fn().mockReturnValue(driverQuery);
    driverQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'driver_1',
        clerk_id: 'clerk_driver',
        first_name: 'Sipho',
        last_name: 'Dlamini',
        full_name: null,
        rating: 5,
        profile_data: {},
      },
      error: null,
    });

    const vehicleQuery: any = {};
    vehicleQuery.select = jest.fn().mockReturnValue(vehicleQuery);
    vehicleQuery.eq = jest.fn().mockReturnValue(vehicleQuery);
    vehicleQuery.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

    const ratingsQuery: any = {};
    ratingsQuery.select = jest.fn().mockReturnValue(ratingsQuery);
    ratingsQuery.eq = jest.fn().mockResolvedValue({ data: [], error: null });

    setupSupabase({
      from: jest.fn((table: string) =>
        table === 'drivers' ? driverQuery : table === 'driver_vehicles' ? vehicleQuery : ratingsQuery,
      ),
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  it('INT-PROFILE-06: GET does not invent a default rating when none is recorded', async () => {
    const driverQuery: any = {};
    driverQuery.select = jest.fn().mockReturnValue(driverQuery);
    driverQuery.eq = jest.fn().mockReturnValue(driverQuery);
    driverQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'driver_1',
        clerk_id: 'clerk_1',
        first_name: 'Alex',
        last_name: 'Driver',
        full_name: 'Alex Driver',
        rating: null,
        profile_data: {},
      },
      error: null,
    });

    const vehicleQuery: any = {};
    vehicleQuery.select = jest.fn().mockReturnValue(vehicleQuery);
    vehicleQuery.eq = jest.fn().mockReturnValue(vehicleQuery);
    vehicleQuery.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

    const ratingsQuery: any = {};
    ratingsQuery.select = jest.fn().mockReturnValue(ratingsQuery);
    ratingsQuery.eq = jest.fn().mockResolvedValue({ data: [], error: null });

    setupSupabase({
      from: jest.fn((table: string) =>
        table === 'drivers' ? driverQuery : table === 'driver_vehicles' ? vehicleQuery : ratingsQuery,
      ),
    });

    // Load the route after installing the mocked Supabase client.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('../../app/(api)/profile+api');
    const request = new Request(
      'https://example.com/api/profile?clerkId=clerk_1',
      { method: 'GET' },
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.rating).toBeNull();
  });

  it('INT-PROFILE-07: GET returns the average of actual driver ratings', async () => {
    const driverQuery: any = {};
    driverQuery.select = jest.fn().mockReturnValue(driverQuery);
    driverQuery.eq = jest.fn().mockReturnValue(driverQuery);
    driverQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'driver_1',
        clerk_id: 'clerk_1',
        first_name: 'Alex',
        last_name: 'Driver',
        full_name: 'Alex Driver',
        rating: 3,
        profile_data: {},
      },
      error: null,
    });

    const vehicleQuery: any = {};
    vehicleQuery.select = jest.fn().mockReturnValue(vehicleQuery);
    vehicleQuery.eq = jest.fn().mockReturnValue(vehicleQuery);
    vehicleQuery.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

    const ratingsQuery: any = {};
    ratingsQuery.select = jest.fn().mockReturnValue(ratingsQuery);
    ratingsQuery.eq = jest.fn().mockResolvedValue({
      data: [{ rating: 4 }, { rating: 5 }],
      error: null,
    });

    setupSupabase({
      from: jest.fn((table: string) =>
        table === 'drivers' ? driverQuery : table === 'driver_vehicles' ? vehicleQuery : ratingsQuery,
      ),
    });

    // Load the route after installing the mocked Supabase client.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('../../app/(api)/profile+api');
    const request = new Request(
      'https://example.com/api/profile?clerkId=clerk_1',
      { method: 'GET' },
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.rating).toBe(4.5);
  });
});