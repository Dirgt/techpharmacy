import { apiJson } from '@/lib/api/v1-auth'

export async function GET() {
  return apiJson({
    success: true,
    data: {
      status: 'ok',
      version: 'v1',
      timestamp: new Date().toISOString(),
      docs: '/api/v1/openapi',
    },
  })
}
