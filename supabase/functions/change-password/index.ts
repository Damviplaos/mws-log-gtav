import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller identity
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

    const { user_id, new_password } = await req.json();

    if (!user_id || !new_password) {
      return new Response(JSON.stringify({ error: 'ต้องระบุ user_id และ new_password' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (new_password.length < 6) {
      return new Response(JSON.stringify({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Prevent changing super_admin password unless caller is super_admin
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('system_role')
      .eq('id', user_id)
      .maybeSingle();

    if (
      targetProfile?.system_role === 'super_admin' &&
      callerProfile.system_role !== 'super_admin'
    ) {
      return new Response(JSON.stringify({ error: 'ไม่สามารถเปลี่ยนรหัสผ่าน Super Admin ได้' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (updateError) {
      return new Response(JSON.stringify({ error: 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
