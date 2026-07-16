import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // User client to verify caller identity
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check caller is admin/super_admin
    const { data: callerProfile } = await supabaseUser
      .from('profiles')
      .select('system_role')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.system_role)) {
      return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์แอดมิน' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { username, password, system_role = 'user' } = await req.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'กรุณากรอก Username และ Password' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate: super_admin can create admin, admin can only create user
    if (system_role === 'super_admin') {
      return new Response(JSON.stringify({ error: 'ไม่สามารถสร้าง Super Admin ได้' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (system_role === 'admin' && callerProfile.system_role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'เฉพาะ Super Admin เท่านั้นที่สร้าง Admin ได้' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Always lowercase email so GoTrue can match it on login
    const email = `${username.toLowerCase()}@gta-fivem.local`;

    // Create auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      const msg = createError.message.includes('already registered')
        ? 'Username นี้ถูกใช้งานแล้ว'
        : createError.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newUser.user!.id,
        username,
        system_role,
      });

    if (profileError) {
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user!.id);
      return new Response(JSON.stringify({ error: 'สร้างโปรไฟล์ไม่สำเร็จ: ' + profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user!.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
