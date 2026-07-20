export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auditoria_inventario: {
        Row: {
          accion: string
          campo_modificado: string | null
          created_at: string | null
          detalles: string | null
          id: string
          inventario_id: string | null
          operador: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          accion: string
          campo_modificado?: string | null
          created_at?: string | null
          detalles?: string | null
          id?: string
          inventario_id?: string | null
          operador?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          accion?: string
          campo_modificado?: string | null
          created_at?: string | null
          detalles?: string | null
          id?: string
          inventario_id?: string | null
          operador?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_inventario_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_inventario_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "vista_inventario_completo"
            referencedColumns: ["inventario_id"]
          },
        ]
      }
      caja_sesiones: {
        Row: {
          abierto_por: string
          estado: string | null
          fecha_apertura: string | null
          fecha_cierre: string | null
          id: string
          monto_apertura: number
          monto_cierre: number | null
        }
        Insert: {
          abierto_por: string
          estado?: string | null
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          id?: string
          monto_apertura: number
          monto_cierre?: number | null
        }
        Update: {
          abierto_por?: string
          estado?: string | null
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          id?: string
          monto_apertura?: number
          monto_cierre?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_sesiones_abierto_por_fkey"
            columns: ["abierto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ciudad: string | null
          condicion_pago_default: number | null
          created_at: string | null
          descuento_default: number | null
          direccion: string | null
          documento: string | null
          email: string | null
          id: string
          iva_default: number | null
          nombre: string
          telefono: string | null
          tipo_cliente: string | null
          tipo_doc: string | null
          updated_at: string | null
        }
        Insert: {
          ciudad?: string | null
          condicion_pago_default?: number | null
          created_at?: string | null
          descuento_default?: number | null
          direccion?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          iva_default?: number | null
          nombre: string
          telefono?: string | null
          tipo_cliente?: string | null
          tipo_doc?: string | null
          updated_at?: string | null
        }
        Update: {
          ciudad?: string | null
          condicion_pago_default?: number | null
          created_at?: string | null
          descuento_default?: number | null
          direccion?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          iva_default?: number | null
          nombre?: string
          telefono?: string | null
          tipo_cliente?: string | null
          tipo_doc?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      compra_detalles: {
        Row: {
          cantidad: number
          compra_id: string | null
          costo_unitario: number
          id: string
          producto_id: string | null
          subtotal: number
        }
        Insert: {
          cantidad?: number
          compra_id?: string | null
          costo_unitario?: number
          id?: string
          producto_id?: string | null
          subtotal?: number
        }
        Update: {
          cantidad?: number
          compra_id?: string | null
          costo_unitario?: number
          id?: string
          producto_id?: string | null
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "compra_detalles_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_detalles_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_detalles_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vista_inventario_completo"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      compras: {
        Row: {
          caja_sesion_id: string | null
          created_at: string | null
          estado_pago: string
          fecha_emision: string
          id: string
          metodo_pago: string | null
          numero_factura: string
          proveedor_id: string | null
          total: number
        }
        Insert: {
          caja_sesion_id?: string | null
          created_at?: string | null
          estado_pago?: string
          fecha_emision?: string
          id?: string
          metodo_pago?: string | null
          numero_factura: string
          proveedor_id?: string | null
          total?: number
        }
        Update: {
          caja_sesion_id?: string | null
          created_at?: string | null
          estado_pago?: string
          fecha_emision?: string
          id?: string
          metodo_pago?: string | null
          numero_factura?: string
          proveedor_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_caja_sesion_id_fkey"
            columns: ["caja_sesion_id"]
            isOneToOne: false
            referencedRelation: "caja_sesiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cronogramas: {
        Row: {
          creado_por: string | null
          created_at: string | null
          fecha: string
          id: string
          turno: string
          usuario_id: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string | null
          fecha: string
          id?: string
          turno: string
          usuario_id: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string | null
          fecha?: string
          id?: string
          turno?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronogramas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      factura_detalles: {
        Row: {
          cantidad_blisters: number | null
          cantidad_cajas: number | null
          cantidad_unidades: number | null
          factura_id: string | null
          id: string
          precio_unitario: number
          producto_id: string | null
        }
        Insert: {
          cantidad_blisters?: number | null
          cantidad_cajas?: number | null
          cantidad_unidades?: number | null
          factura_id?: string | null
          id?: string
          precio_unitario: number
          producto_id?: string | null
        }
        Update: {
          cantidad_blisters?: number | null
          cantidad_cajas?: number | null
          cantidad_unidades?: number | null
          factura_id?: string | null
          id?: string
          precio_unitario?: number
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "factura_detalles_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_detalles_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "vista_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_detalles_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_detalles_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vista_inventario_completo"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      facturas: {
        Row: {
          caja_sesion_id: string | null
          cliente_documento: string | null
          cliente_nombre: string | null
          condicion_pago_dias: number | null
          created_at: string | null
          descuento_monto: number | null
          descuento_porcentaje: number | null
          estado_pago: string | null
          fecha_vencimiento: string | null
          id: string
          iva_porcentaje: number | null
          iva_total: number | null
          metodo_pago: string | null
          numero: number
          orden_compra: string | null
          subtotal_bruto: number | null
          tipo_venta: string | null
          total: number | null
          vendedor_id: string
        }
        Insert: {
          caja_sesion_id?: string | null
          cliente_documento?: string | null
          cliente_nombre?: string | null
          condicion_pago_dias?: number | null
          created_at?: string | null
          descuento_monto?: number | null
          descuento_porcentaje?: number | null
          estado_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          iva_porcentaje?: number | null
          iva_total?: number | null
          metodo_pago?: string | null
          numero?: number
          orden_compra?: string | null
          subtotal_bruto?: number | null
          tipo_venta?: string | null
          total?: number | null
          vendedor_id: string
        }
        Update: {
          caja_sesion_id?: string | null
          cliente_documento?: string | null
          cliente_nombre?: string | null
          condicion_pago_dias?: number | null
          created_at?: string | null
          descuento_monto?: number | null
          descuento_porcentaje?: number | null
          estado_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          iva_porcentaje?: number | null
          iva_total?: number | null
          metodo_pago?: string | null
          numero?: number
          orden_compra?: string | null
          subtotal_bruto?: number | null
          tipo_venta?: string | null
          total?: number | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_caja_sesion_id_fkey"
            columns: ["caja_sesion_id"]
            isOneToOne: false
            referencedRelation: "caja_sesiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          caja_sesion_id: string
          comprobante: string | null
          concepto: string
          created_at: string | null
          id: string
          monto: number
          tipo: string
        }
        Insert: {
          caja_sesion_id: string
          comprobante?: string | null
          concepto: string
          created_at?: string | null
          id?: string
          monto: number
          tipo?: string
        }
        Update: {
          caja_sesion_id?: string
          comprobante?: string | null
          concepto?: string
          created_at?: string | null
          id?: string
          monto?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_caja_sesion_id_fkey"
            columns: ["caja_sesion_id"]
            isOneToOne: false
            referencedRelation: "caja_sesiones"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario: {
        Row: {
          blisters: number | null
          cajas: number | null
          created_at: string | null
          fecha_vencimiento: string | null
          id: string
          lote: string | null
          margen_blister: number | null
          margen_unidad: number | null
          porcentaje_ganancia: number | null
          precio_blister: number | null
          precio_caja: number | null
          precio_unidad: number | null
          producto_id: string
          registro_invima: string | null
          seccion: string | null
          stock_minimo: number | null
          ubicacion: string | null
          unidades: number | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          blisters?: number | null
          cajas?: number | null
          created_at?: string | null
          fecha_vencimiento?: string | null
          id?: string
          lote?: string | null
          margen_blister?: number | null
          margen_unidad?: number | null
          porcentaje_ganancia?: number | null
          precio_blister?: number | null
          precio_caja?: number | null
          precio_unidad?: number | null
          producto_id: string
          registro_invima?: string | null
          seccion?: string | null
          stock_minimo?: number | null
          ubicacion?: string | null
          unidades?: number | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          blisters?: number | null
          cajas?: number | null
          created_at?: string | null
          fecha_vencimiento?: string | null
          id?: string
          lote?: string | null
          margen_blister?: number | null
          margen_unidad?: number | null
          porcentaje_ganancia?: number | null
          precio_blister?: number | null
          precio_caja?: number | null
          precio_unidad?: number | null
          producto_id?: string
          registro_invima?: string | null
          seccion?: string | null
          stock_minimo?: number | null
          ubicacion?: string | null
          unidades?: number | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "vista_inventario_completo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "inventario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratorios: {
        Row: {
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      logs_actividad: {
        Row: {
          accion: string
          created_at: string | null
          detalles: string
          entidad_id: string | null
          id: string
          tipo_entidad: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string | null
          detalles: string
          entidad_id?: string | null
          id?: string
          tipo_entidad?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string | null
          detalles?: string
          entidad_id?: string | null
          id?: string
          tipo_entidad?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      productos: {
        Row: {
          codigo: string
          created_at: string | null
          descripcion: string | null
          id: string
          laboratorio_id: string | null
          nombre: string
          principio_activo: string | null
          updated_at: string | null
        }
        Insert: {
          codigo: string
          created_at?: string | null
          descripcion?: string | null
          id?: string
          laboratorio_id?: string | null
          nombre: string
          principio_activo?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string | null
          descripcion?: string | null
          id?: string
          laboratorio_id?: string | null
          nombre?: string
          principio_activo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "vista_inventario_completo"
            referencedColumns: ["laboratorio_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          role: string | null
          status: string | null
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          role?: string | null
          status?: string | null
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: string | null
          status?: string | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          created_at: string | null
          dias_credito: number | null
          documento_nit: string | null
          email: string | null
          id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          created_at?: string | null
          dias_credito?: number | null
          documento_nit?: string | null
          email?: string | null
          id?: string
          nombre: string
          telefono?: string | null
        }
        Update: {
          created_at?: string | null
          dias_credito?: number | null
          documento_nit?: string | null
          email?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      vista_cartera: {
        Row: {
          cliente_documento: string | null
          cliente_nombre: string | null
          condicion_pago_dias: number | null
          created_at: string | null
          descuento_monto: number | null
          descuento_porcentaje: number | null
          dias_restantes: number | null
          estado_pago: string | null
          estado_plazo: string | null
          fecha_vencimiento: string | null
          id: string | null
          iva_total: number | null
          metodo_pago: string | null
          numero: number | null
          orden_compra: string | null
          subtotal_bruto: number | null
          tipo_venta: string | null
          total_con_descuento: number | null
          total_sin_descuento: number | null
          vendedor: string | null
        }
        Relationships: []
      }
      vista_inventario_completo: {
        Row: {
          actualizado_por: string | null
          blisters: number | null
          cajas: number | null
          codigo: string | null
          fecha_vencimiento: string | null
          inventario_id: string | null
          laboratorio: string | null
          laboratorio_id: string | null
          lote: string | null
          margen_blister: number | null
          margen_caja: number | null
          margen_unidad: number | null
          nombre_producto: string | null
          precio_blister: number | null
          precio_caja: number | null
          precio_unidad: number | null
          principio_activo: string | null
          producto_id: string | null
          registro_invima: string | null
          seccion: string | null
          stock_minimo: number | null
          ubicacion: string | null
          unidades: number | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      registrar_compra_tx: {
        Args: {
          p_caja_sesion_id: string
          p_detalles: Database["public"]["CompositeTypes"]["compra_detalle_input"][]
          p_estado_pago: string
          p_metodo_pago: string
          p_numero_factura: string
          p_proveedor_id: string
          p_total: number
          p_user_id: string
        }
        Returns: Json
      }
      registrar_gasto_tx: {
        Args: {
          p_caja_sesion_id: string
          p_comprobante?: string
          p_concepto: string
          p_monto: number
          p_tipo: string
        }
        Returns: Json
      }
      upsert_inventario_tx: {
        Args: {
          p_blisters: number
          p_cajas: number
          p_codigo: string
          p_fecha_vencimiento: string
          p_inventario_id?: string
          p_laboratorio_id: string
          p_lote: string
          p_margen_blister: number
          p_margen_unidad: number
          p_nombre: string
          p_porcentaje_ganancia: number
          p_precio_blister: number
          p_precio_caja: number
          p_precio_unidad: number
          p_principio_activo: string
          p_producto_id: string
          p_registro_invima: string
          p_seccion: string
          p_stock_minimo: number
          p_ubicacion: string
          p_unidades: number
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      compra_detalle_input: {
        producto_id: string | null
        cantidad: number | null
        costo_unitario: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
