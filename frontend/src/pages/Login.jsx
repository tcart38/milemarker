import React, { useState } from 'react'
import { Car } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'

// Shown in place of the whole app when login is enabled and there's no session.
export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await login(username, password) }
    catch (err) { setError(err.message); setPassword('') }
    finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Car className="size-5 text-primary" /> MileMarker
          </CardTitle>
          <CardDescription>Sign in to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup className="gap-4">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="login-user">Username</FieldLabel>
                <Input id="login-user" autoComplete="username" autoCapitalize="none" autoFocus
                  value={username} onChange={(e) => setUsername(e.target.value)} required />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="login-pass">Password</FieldLabel>
                <Input id="login-pass" type="password" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              {error && <FieldError>{error}</FieldError>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? <><Spinner /> Signing in…</> : 'Sign in'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
