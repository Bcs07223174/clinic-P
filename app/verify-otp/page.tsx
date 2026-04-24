"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle, Loader2, Mail, RefreshCw, Shield } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

function VerifyOTPContent() {
  const [otpCode, setOtpCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [timeLeft, setTimeLeft] = useState(30 * 60) // 30 minutes in seconds
  const [email, setEmail] = useState("")
  
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Get email from URL parameters
    const emailParam = searchParams.get("email")
    if (emailParam) {
      setEmail(emailParam)
    } else {
      // Redirect back to signup if no email
      router.push("/login")
    }
  }, [searchParams, router])

  useEffect(() => {
    // Countdown timer
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [timeLeft])

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!otpCode || otpCode.length !== 6) {
      setError("Please enter a valid 6-digit OTP code")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          otpCode,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess("Account verified successfully! Logging you in...")
        
        // Auto-login the user after successful verification
        const verifiedUserData = data
        
        // Store user data in localStorage for auto-login
        localStorage.setItem("patient_user", JSON.stringify({
          _id: verifiedUserData._id,
          name: verifiedUserData.name,
          email: verifiedUserData.email,
          phone: verifiedUserData.phone,
          role: verifiedUserData.role
        }))
        
        console.log("User verified and logged in automatically:", verifiedUserData.email)
        
        setTimeout(() => {
          // Redirect to main page since user is now logged in
          router.push("/?verified=true")
        }, 2000)
      } else {
        setError(data.error || "OTP verification failed")
      }
    } catch (error) {
      console.error("Verification error:", error)
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOTP = async () => {
    setIsResending(true)
    setError("")

    try {
      const response = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess("New OTP sent successfully!")
        setTimeLeft(30 * 60) // Reset timer
        setOtpCode("") // Clear current OTP
      } else {
        setError(data.error || "Failed to resend OTP")
      }
    } catch (error) {
      console.error("Resend error:", error)
      setError("Failed to resend OTP. Please try again.")
    } finally {
      setIsResending(false)
    }
  }

  const handleOTPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6)
    setOtpCode(value)
    setError("")
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg border-sky-200">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-sky-800 mb-2">Account Verified!</h3>
            <p className="text-sky-600 mb-4">{success}</p>
            <p className="text-sm text-sky-500">Redirecting to main page...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg border-sky-200">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-sky-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-sky-800">Verify Your Account</CardTitle>
          <CardDescription className="text-sky-600">
            We've sent a 6-digit verification code to:
            <br />
            <span className="font-medium text-sky-800">{email}</span>
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp" className="text-sm font-medium text-sky-700">
                Enter OTP Code
              </Label>
              <Input
                id="otp"
                type="text"
                value={otpCode}
                onChange={handleOTPChange}
                placeholder="000000"
                className="text-center text-lg tracking-widest font-mono border-sky-300 focus:border-sky-500"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || otpCode.length !== 6}
              className="w-full bg-sky-600 hover:bg-sky-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify Account"
              )}
            </Button>
          </form>

          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-sky-600">
              <Mail className="w-4 h-4" />
              <span>Code expires in: {formatTime(timeLeft)}</span>
            </div>

            <div className="text-sm">
              <span className="text-sky-600">Didn't receive the code? </span>
              <Button
                type="button"
                variant="link"
                onClick={handleResendOTP}
                disabled={isResending || timeLeft > 0}
                className="p-0 h-auto text-sky-600 hover:text-sky-700"
              >
                {isResending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Resend OTP"
                )}
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/login")}
              className="w-full border-sky-300 text-sky-700 hover:bg-sky-50"
            >
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <VerifyOTPContent />
    </Suspense>
  )
}