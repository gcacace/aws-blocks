export const dynamic = 'force-dynamic';

export default function ErrorBoundaryPage() {
  throw new Error('intentional from /error-boundary');
}
