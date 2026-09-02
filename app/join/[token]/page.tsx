import JoinForm from './join-form';

export const dynamic = 'force-dynamic';

// The token is never checked here. Validating it in the page would mean
// letting an unauthenticated client read the invites table, which would leak
// every live token; /api/join does the check with the service-role key.
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinForm token={token} />;
}
