import { NextRequest } from 'next/server'
import { apiJson } from '@/lib/api/v1-auth'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'TechPharmacy Enterprise API',
      version: '1.0.0',
      description:
        'API REST multi-tenant autenticada mediante API Keys por droguería para integraciones con ERP, contabilidad, comercio electrónico y aplicaciones móviles.',
    },
    servers: [{ url: origin, description: 'Servidor actual' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Authorization: Bearer tp_live_...',
        },
        ApiKeyHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Cabecera alternativa: x-api-key: tp_live_...',
        },
      },
    },
    security: [{ BearerAuth: [] }, { ApiKeyHeader: [] }],
    paths: {
      '/api/v1/health': {
        get: {
          summary: 'Estado del servicio API v1',
          security: [],
          responses: { '200': { description: 'Servicio operativo' } },
        },
      },
      '/api/v1/productos': {
        get: {
          summary: 'Listar catálogo de productos (scope: read:productos)',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          ],
          responses: {
            '200': { description: 'Listado paginado de productos' },
            '401': { description: 'API Key inválida o expirada' },
            '403': { description: 'Scope insuficiente o sede suspendida' },
            '429': { description: 'Límite de tasa excedido' },
          },
        },
      },
      '/api/v1/inventario': {
        get: {
          summary: 'Consultar stock, lotes y precios (scope: read:inventario)',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'stock_bajo', in: 'query', schema: { type: 'boolean' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          ],
          responses: {
            '200': { description: 'Listado paginado de inventario' },
            '401': { description: 'API Key inválida o expirada' },
            '403': { description: 'Scope insuficiente o sede suspendida' },
            '429': { description: 'Límite de tasa excedido' },
          },
        },
      },
      '/api/v1/facturas': {
        get: {
          summary: 'Listar facturas emitidas (scope: read:facturas)',
          parameters: [
            { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'estado_pago', in: 'query', schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          ],
          responses: {
            '200': { description: 'Listado paginado de facturas' },
            '401': { description: 'API Key inválida o expirada' },
            '403': { description: 'Scope insuficiente o sede suspendida' },
            '429': { description: 'Límite de tasa excedido' },
          },
        },
      },
      '/api/v1/clientes': {
        get: {
          summary: 'Listar clientes (scope: read:clientes)',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          ],
          responses: {
            '200': { description: 'Listado paginado de clientes' },
          },
        },
        post: {
          summary: 'Crear cliente (scope: write:clientes)',
          responses: {
            '201': { description: 'Cliente creado correctamente' },
            '400': { description: 'Datos inválidos' },
          },
        },
      },
    },
  }

  return apiJson(spec)
}
