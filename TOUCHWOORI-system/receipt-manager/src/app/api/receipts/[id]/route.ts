export const runtime = 'nodejs';

import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 영수증 단건 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    const { data: receipt, error } = await supabase
      .from('receipts')
      .select('*, users!submitted_by(name), categories(name, type)')
      .eq('id', id)
      .single();

    if (error || !receipt) {
      return NextResponse.json({ error: '영수증을 찾을 수 없습니다' }, { status: 404 });
    }

    // 역할별 접근 제어
    if (profile.role === 'teacher' && receipt.submitted_by !== authUser.id) {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    if (profile.role === 'accountant' && receipt.department_id !== profile.department_id) {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    return NextResponse.json({ data: receipt });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// PATCH: 영수증 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    // 기존 영수증 확인
    const { data: receipt } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', id)
      .single();

    if (!receipt) {
      return NextResponse.json({ error: '영수증을 찾을 수 없습니다' }, { status: 404 });
    }

    // 역할별 수정 권한 체크
    if (profile.role === 'teacher') {
      if (receipt.submitted_by !== authUser.id) {
        return NextResponse.json({ error: '본인의 영수증만 수정할 수 있습니다' }, { status: 403 });
      }
      if (receipt.status !== 'pending') {
        return NextResponse.json({ error: '대기 중인 영수증만 수정할 수 있습니다' }, { status: 400 });
      }
    } else if (profile.role === 'accountant') {
      if (receipt.department_id !== profile.department_id) {
        return NextResponse.json({ error: '같은 부서의 영수증만 수정할 수 있습니다' }, { status: 403 });
      }
    }
    // Master: 모든 영수증 수정 가능

    const body = await request.json();
    const allowedFields = [
      'date', 'description', 'final_amount', 'category_id',
      'image_url', 'vendor', 'subtotal', 'discount',
      'delivery_fee', 'memo', 'ocr_raw', 'pdf_crop',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length <= 1) {
      return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
    }

    // 유효성 검사
    if (updateData.description !== undefined) {
      const desc = updateData.description as string;
      if (typeof desc !== 'string' || desc.length < 1 || desc.length > 200) {
        return NextResponse.json(
          { error: '설명은 1자 이상 200자 이하로 입력해주세요' },
          { status: 400 }
        );
      }
    }

    if (updateData.final_amount !== undefined) {
      const amount = updateData.final_amount as number;
      if (typeof amount !== 'number' || amount < 0 || amount > 99999999) {
        return NextResponse.json(
          { error: '최종 금액은 0원 이상 99,999,999원 이하로 입력해주세요' },
          { status: 400 }
        );
      }
    }

    if (updateData.date !== undefined) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(updateData.date as string) || isNaN(new Date(updateData.date as string).getTime())) {
        return NextResponse.json(
          { error: '유효한 날짜 형식이 아닙니다 (YYYY-MM-DD)' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from('receipts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `영수증 수정에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// DELETE: 영수증 삭제 (master 전용)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    // 영수증 조회 (권한 확인 + 이미지 URL)
    const { data: receipt } = await supabase
      .from('receipts')
      .select('image_url, submitted_by, status, department_id')
      .eq('id', id)
      .single();

    if (!receipt) {
      return NextResponse.json({ error: '영수증을 찾을 수 없습니다' }, { status: 404 });
    }

    // 역할별 삭제 권한
    if (profile.role === 'teacher') {
      if (receipt.submitted_by !== authUser.id) {
        return NextResponse.json({ error: '본인의 영수증만 삭제할 수 있습니다' }, { status: 403 });
      }
      if (receipt.status !== 'pending') {
        return NextResponse.json({ error: '대기 중인 영수증만 삭제할 수 있습니다' }, { status: 400 });
      }
    } else if (profile.role === 'accountant') {
      if (receipt.department_id !== profile.department_id) {
        return NextResponse.json({ error: '같은 부서의 영수증만 삭제할 수 있습니다' }, { status: 403 });
      }
    }

    // ledger_entries FK 해제
    await supabase
      .from('ledger_entries')
      .update({ receipt_id: null })
      .eq('receipt_id', id);

    // 이미지가 있으면 Storage에서 삭제 (service role 사용)
    if (receipt.image_url) {
      try {
        const serviceClient = createServiceClient();
        // image_url에서 storage 경로 추출
        // 예: https://xxx.supabase.co/storage/v1/object/public/receipts/path/to/file.jpg
        const url = new URL(receipt.image_url);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/receipts\/(.+)/);
        if (pathMatch) {
          await serviceClient.storage.from('receipts').remove([pathMatch[1]]);
        }
      } catch (err) {
        // 이미지 삭제 실패해도 영수증 삭제는 진행
        console.error('이미지 삭제 실패');
      }
    }

    // 영수증 삭제
    const { error } = await supabase
      .from('receipts')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: `영수증 삭제에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: { message: '영수증이 삭제되었습니다' } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
