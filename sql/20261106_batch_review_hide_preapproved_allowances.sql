-- Read-only Batch Earning Review: expose existing separate Driver Allowance statuses.
-- The client hides allowances already approved at stock issue; no amounts or records change.
-- The original financial approval RPC is intentionally unchanged.
CREATE OR REPLACE FUNCTION public.bb_staff_relation_admin_batch_earning_reviews(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,200),500));
  v_rows jsonb;
begin
  perform private.bb_staff_relation_require_admin();

  select coalesce(jsonb_agg(q.obj order by q.created_at desc,q.review_id desc),'[]'::jsonb)
  into v_rows
  from (
    select r.review_id,r.created_at,
      jsonb_build_object(
        'reviewId',r.review_id,
        'reviewNo','BER-'||lpad(r.review_id::text,6,'0'),
        'batchId',b.batch_id,
        'batchDate',b.batch_date,
        'batchStatus',b.status,
        'locationCode',b.location_code,
        'locationName',coalesce(b.location_name_snapshot,b.location_code),
        'incentiveMode',b.incentive_mode,
        'salesmanStaffId',coalesce(b.salesman_staff_id,''),
        'salesmanName',coalesce(b.salesman_name_snapshot,''),
        'driver1StaffId',coalesce(b.driver_staff_id,''),
        'driver1Name',coalesce(b.driver_name_snapshot,''),
        'driver2StaffId',coalesce(b.driver2_staff_id,''),
        'driver2Name',coalesce(b.driver2_name_snapshot,''),
        'separateDriverAllowanceWorkflow',exists(
          select 1 from public.staff_driver_allowance_requests da
          where da.batch_id=b.batch_id
        ),
        'driverAllowances',coalesce((
          select jsonb_object_agg(da.driver_role,jsonb_build_object(
            'status',da.status,
            'approvedAmount',coalesce(da.approved_amount,0),
            'earningId',da.earning_id
          ))
          from public.staff_driver_allowance_requests da
          where da.batch_id=b.batch_id
        ),'{}'::jsonb),
        'issuedQty',coalesce(b.issued_qty,0),
        'soldQty',coalesce(b.sold_qty,0),
        'calculation',private.bb_batch_earning_calculation(b.batch_id),
        'createdAt',r.created_at,
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'productCode',i.product_code,
            'productName',coalesce(i.product_name_snapshot,i.product_code),
            'unit',coalesce(i.unit_snapshot,''),
            'issuedQty',coalesce(i.issued_qty,0),
            'soldQty',coalesce(i.sold_qty_snapshot,0),
            'backSaleQty',coalesce(i.back_sale_qty,0),
            'damagedQty',coalesce(i.damaged_qty,0)
          ) order by i.product_name_snapshot,i.product_code)
          from public.stock_batch_items i where i.batch_id=b.batch_id
        ),'[]'::jsonb)
      ) obj
    from public.staff_batch_earning_reviews r
    join public.stock_batches b on b.batch_id=r.batch_id
    where r.status='PENDING'
    order by r.created_at desc,r.review_id desc
    limit v_limit
  ) q;

  return jsonb_build_object(
    'success',true,
    'count',(select count(*) from public.staff_batch_earning_reviews where status='PENDING'),
    'reviews',v_rows
  );
end;
$function$;
