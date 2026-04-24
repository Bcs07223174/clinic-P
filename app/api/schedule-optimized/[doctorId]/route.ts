import { connectToDatabase } from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Optimized Doctor Schedule API with Index-Based Queries
 * 
 * Key optimizations:
 * 1. Uses compound indexes: (doctorId, dayOfWeek) and (doctorId, weekStart, weekEnd)
 * 2. Implements query projection to fetch only necessary fields
 * 3. Uses $elemMatch for efficient array filtering
 * 4. Implements strategic query ordering from most specific to least specific
 * 5. Includes index hints for query optimization
 */

export async function GET(request: NextRequest, { params }: { params: { doctorId: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const dayOfWeek = searchParams.get("dayOfWeek")

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(params.doctorId)) {
      return NextResponse.json({ error: "Invalid doctor ID format" }, { status: 400 })
    }

    const db = await connectToDatabase()
    
    // Ensure optimized indexes exist
    await ensureOptimizedIndexes(db)

    const doctorObjectId = new ObjectId(params.doctorId)
    let schedule = null
    let queryStrategy = ""
    let dayOfWeekToSearch = dayOfWeek

    // Calculate dayOfWeek from date if not provided
    if (date && !dayOfWeekToSearch) {
      dayOfWeekToSearch = new Date(date).toLocaleDateString("en-US", { weekday: "long" })
    }

    // STRATEGY 1: Week-specific + Day-specific query (most optimized)
    if (date && dayOfWeekToSearch) {
      const requestedDate = new Date(date)
      queryStrategy = "week-specific-day-optimized"
      
      schedule = await db.collection("doctor_schedules")
        .findOne(
          {
            doctorId: doctorObjectId,
            weekStart: { $lte: requestedDate },
            weekEnd: { $gte: requestedDate },
            "days.dayOfWeek": dayOfWeekToSearch
          },
          {
            projection: {
              "days.$": 1, // Only return matching day
              weekStart: 1,
              weekEnd: 1,
              doctorId: 1,
              _id: 1
            },
            hint: "doctorId_dateRange_idx" // Use date range index
          }
        )

      if (schedule !== null && schedule.days && schedule.days.length > 0) {
        return NextResponse.json({
          ...schedule,
          selectedDay: schedule.days[0],
          scheduleType: "week-specific-optimized",
          queryStrategy,
          isWithinRange: true,
          requestedDate: date,
          dayOfWeek: dayOfWeekToSearch,
          optimizationUsed: "compound-index-week-day"
        })
      }
    }

    // STRATEGY 2: General schedule + Day-specific query (compound index optimized)
    if (dayOfWeekToSearch) {
      queryStrategy = "general-day-optimized"
      
      schedule = await db.collection("doctor_schedules")
        .findOne(
          {
            doctorId: doctorObjectId,
            weekStart: { $exists: false },
            weekEnd: { $exists: false },
            "days.dayOfWeek": dayOfWeekToSearch
          },
          {
            projection: {
              days: {
                $elemMatch: { dayOfWeek: dayOfWeekToSearch }
              },
              doctorId: 1,
              _id: 1,
              allowOutsideRange: 1
            },
            hint: "doctorId_dayOfWeek_idx" // Use compound index
          }
        )

      if (schedule !== null && schedule.days && schedule.days.length > 0) {
        return NextResponse.json({
          ...schedule,
          selectedDay: schedule.days[0],
          scheduleType: "general-optimized",
          queryStrategy,
          dayOfWeek: dayOfWeekToSearch,
          optimizationUsed: "compound-index-doctor-day"
        })
      }
    }

    // STRATEGY 3: Any schedule for doctor + Day filtering (fallback with doctorId index)
    if (dayOfWeekToSearch) {
      queryStrategy = "any-schedule-day-filter"
      
      schedule = await db.collection("doctor_schedules")
        .findOne(
          {
            doctorId: doctorObjectId,
            "days.dayOfWeek": dayOfWeekToSearch
          },
          {
            projection: {
              days: {
                $elemMatch: { dayOfWeek: dayOfWeekToSearch }
              },
              weekStart: 1,
              weekEnd: 1,
              doctorId: 1,
              _id: 1
            },
            hint: "doctorId_idx" // Use simple doctorId index
          }
        )

      if (schedule !== null && schedule.days && schedule.days.length > 0) {
        const isWithinRange = date ? checkDateInRange(new Date(date), schedule.weekStart, schedule.weekEnd) : true
        
        return NextResponse.json({
          ...schedule,
          selectedDay: schedule.days[0],
          scheduleType: schedule.weekStart ? "week-specific-fallback" : "general-fallback",
          queryStrategy,
          isWithinRange,
          dayOfWeek: dayOfWeekToSearch,
          optimizationUsed: "single-index-doctor"
        })
      }
    }

    // STRATEGY 4: Week-specific without day filter (for date-based queries)
    if (date) {
      const requestedDate = new Date(date)
      queryStrategy = "week-specific-full"
      
      schedule = await db.collection("doctor_schedules")
        .findOne(
          {
            doctorId: doctorObjectId,
            weekStart: { $lte: requestedDate },
            weekEnd: { $gte: requestedDate }
          },
          {
            hint: "doctorId_dateRange_idx"
          }
        )

      if (schedule) {
        return NextResponse.json({
          ...schedule,
          scheduleType: "week-specific-full",
          queryStrategy,
          isWithinRange: true,
          requestedDate: date,
          dayOfWeek: dayOfWeekToSearch,
          optimizationUsed: "date-range-index"
        })
      }
    }

    // STRATEGY 5: General schedule (no date constraints)
    queryStrategy = "general-full"
    schedule = await db.collection("doctor_schedules")
      .findOne(
        {
          doctorId: doctorObjectId,
          weekStart: { $exists: false },
          weekEnd: { $exists: false }
        },
        {
          hint: "doctorId_idx"
        }
      )

    if (schedule) {
      return NextResponse.json({
        ...schedule,
        scheduleType: "general-full",
        queryStrategy,
        dayOfWeek: dayOfWeekToSearch,
        optimizationUsed: "doctor-index"
      })
    }

    // STRATEGY 6: Any schedule for this doctor (final fallback)
    queryStrategy = "any-schedule"
    schedule = await db.collection("doctor_schedules")
      .findOne(
        { doctorId: doctorObjectId },
        {
          hint: "doctorId_idx"
        }
      )

    if (schedule) {
      const isWithinRange = date ? checkDateInRange(new Date(date), schedule.weekStart, schedule.weekEnd) : null
      
      return NextResponse.json({
        ...schedule,
        scheduleType: "any-available",
        queryStrategy,
        isWithinRange,
        dayOfWeek: dayOfWeekToSearch,
        optimizationUsed: "basic-doctor-index",
        message: schedule.weekStart ? 
          `Schedule found but may be outside requested date range` : 
          `General schedule found`
      })
    }

    // No schedule found - return default schedule
    return NextResponse.json({
      doctorId: params.doctorId,
      days: getDefaultSchedule(),
      scheduleType: "default",
      queryStrategy: "fallback-default",
      message: "No schedule found, using default schedule",
      optimizationUsed: "none"
    })

  } catch (error) {
    console.error("Error in optimized schedule API:", error)
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

/**
 * Ensure all optimized indexes exist
 */
async function ensureOptimizedIndexes(db: any) {
  const collection = db.collection("doctor_schedules")
  
  try {
    // Compound index for doctorId + dayOfWeek (most common query pattern)
    await collection.createIndex(
      { 
        doctorId: 1, 
        "days.dayOfWeek": 1 
      },
      { 
        name: "doctorId_dayOfWeek_idx",
        background: true 
      }
    )

    // Compound index for doctorId + date range queries
    await collection.createIndex(
      { 
        doctorId: 1, 
        weekStart: 1, 
        weekEnd: 1 
      },
      { 
        name: "doctorId_dateRange_idx",
        background: true 
      }
    )

    // Simple doctorId index for basic queries
    await collection.createIndex(
      { doctorId: 1 },
      { 
        name: "doctorId_idx",
        background: true 
      }
    )

    // Compound index for general schedules with day lookup
    await collection.createIndex(
      { 
        doctorId: 1, 
        weekStart: 1, // For existence check
        "days.dayOfWeek": 1 
      },
      { 
        name: "doctorId_general_day_idx",
        background: true,
        partialFilterExpression: { weekStart: { $exists: false } }
      }
    )

    console.log("✅ Optimized indexes created for doctor_schedules collection")
  } catch (error) {
    // Indexes may already exist
    console.log("ℹ️ Indexes already exist or creation skipped")
  }
}

/**
 * Check if a date falls within a schedule's date range
 */
function checkDateInRange(date: Date, weekStart?: Date, weekEnd?: Date): boolean {
  if (!weekStart || !weekEnd) return true
  return date >= weekStart && date <= weekEnd
}

/**
 * Get default schedule when no schedule is found
 */
function getDefaultSchedule() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  
  return days.map(dayOfWeek => ({
    dayOfWeek,
    isOffDay: dayOfWeek === 'Sunday',
    morningStart: dayOfWeek === 'Sunday' ? null : "09:00",
    morningEnd: dayOfWeek === 'Sunday' ? null : "12:00",
    eveningStart: dayOfWeek === 'Sunday' ? null : "14:00",
    eveningEnd: dayOfWeek === 'Sunday' ? null : "18:00",
    slotduration: "30"
  }))
}