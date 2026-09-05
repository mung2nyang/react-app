begin;

drop policy if exists "linked driver can write owner scoped clients" on public.clients;
create policy "linked driver can write owner scoped clients"
  on public.clients
  for all
  using (
    exists (
      select 1
      from public.driver_links dl
      join public.vehicles v on v.id = dl.vehicle_id
      where dl.driver_id = auth.uid()
        and dl.status = 'linked'
        and dl.owner_id = clients.user_id
        and v.number = (clients.raw ->> 'scopedToVehicleNumber')
    )
  )
  with check (
    exists (
      select 1
      from public.driver_links dl
      join public.vehicles v on v.id = dl.vehicle_id
      where dl.driver_id = auth.uid()
        and dl.status = 'linked'
        and dl.owner_id = clients.user_id
        and v.number = (clients.raw ->> 'scopedToVehicleNumber')
    )
  );

commit;
