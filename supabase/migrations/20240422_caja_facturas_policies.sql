-- Políticas RLS para caja_sesiones
CREATE POLICY "Allow authenticated users to read caja" ON caja_sesiones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert caja" ON caja_sesiones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update caja" ON caja_sesiones FOR UPDATE TO authenticated USING (true);

-- Políticas RLS para facturas
CREATE POLICY "Allow authenticated users to insert facturas" ON facturas FOR INSERT TO authenticated WITH CHECK (true);

-- Políticas RLS para factura_detalles
CREATE POLICY "Allow authenticated users to insert factura_detalles" ON factura_detalles FOR INSERT TO authenticated WITH CHECK (true);
