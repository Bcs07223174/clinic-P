import { connectToDatabase } from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const targetDoctorId = "68c313d3e4b7269f1c7f601c"
    
    console.log(`Searching for schedule for doctor ID: ${targetDoctorId}`)
    
    const db = await connectToDatabase()
    
    // Search for schedules with this specific doctor ID
    const schedules = await db.collection("doctor_schedules").find({
      doctorId: new ObjectId(targetDoctorId)
    }).toArray()
    
    console.log(`Found ${schedules.length} schedules for doctor ${targetDoctorId}`)
    
    // Log the raw data format for debugging
    if (schedules.length > 0) {
      const firstSchedule = schedules[0]!
      console.log("Raw schedule data format:", {
        _id: firstSchedule._id,
        _idType: typeof firstSchedule._id,
        doctorId: firstSchedule.doctorId,
        doctorIdType: typeof firstSchedule.doctorId,
        weekStart: firstSchedule.weekStart,
        weekStartType: typeof firstSchedule.weekStart,
        weekEnd: firstSchedule.weekEnd,
        weekEndType: typeof firstSchedule.weekEnd,
        firstDayDate: firstSchedule.days?.[0]?.date,
        firstDayDateType: typeof firstSchedule.days?.[0]?.date
      })
    }
    
    if (schedules.length === 0) {
      // Also search by string format in case it's stored differently
      const schedulesByString = await db.collection("doctor_schedules").find({
        doctorId: targetDoctorId
      }).toArray()
      
      console.log(`Found ${schedulesByString.length} schedules with string doctorId`)
      
      // Also search all schedules to see what doctor IDs exist
      const allSchedules = await db.collection("doctor_schedules").find({}).toArray()
      const allDoctorIds = allSchedules.map(s => s.doctorId?.toString())
      
      return NextResponse.json({
        success: false,
        targetDoctorId,
        foundSchedules: schedules.length,
        foundByString: schedulesByString.length,
        message: "No schedules found for this doctor",
        allDoctorIdsInDatabase: allDoctorIds,
        totalSchedulesInDatabase: allSchedules.length,
        suggestion: "Check if the doctor ID exists in the doctors collection or if the schedule uses a different doctor ID format"
      })
    }
    
    // Process found schedules
    const processedSchedules = schedules.map(schedule => {
      const hasWeekRange = !!(schedule.weekStart && schedule.weekEnd)
      const hasPreCalculatedSlots = schedule.days?.[0]?.morningSlots ? true : false
      
      return {
        _id: schedule._id,
        doctorId: schedule.doctorId,
        scheduleType: hasWeekRange ? "week-specific" : "general",
        weekStart: schedule.weekStart || null,
        weekEnd: schedule.weekEnd || null,
        daysCount: schedule.days?.length || 0,
        hasPreCalculatedSlots,
        createdAt: schedule.createdAt,
        createdBy: schedule.createdBy,
        sampleDay: schedule.days?.[0] ? {
          dayOfWeek: schedule.days[0].dayOfWeek,
          isOffDay: schedule.days[0].isOffDay,
          morningStart: schedule.days[0].morningStart,
          morningEnd: schedule.days[0].morningEnd,
          eveningStart: schedule.days[0].eveningStart,
          eveningEnd: schedule.days[0].eveningEnd,
          morningSlots: schedule.days[0].morningSlots?.length || 0,
          eveningSlots: schedule.days[0].eveningSlots?.length || 0,
          slotDuration: schedule.days[0].slotduration
        } : null
      }
    })
    
    // Test the schedule API endpoint
    const testDate = "2025-09-10"
    const scheduleApiResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/schedule/${targetDoctorId}?date=${testDate}`)
    let scheduleApiResult = null
    
    if (scheduleApiResponse.ok) {
      scheduleApiResult = await scheduleApiResponse.json()
    }
    
    return NextResponse.json({
      success: true,
      targetDoctorId,
      foundSchedules: schedules.length,
      schedules: processedSchedules,
      fullScheduleData: schedules, // Include full data for debugging
      scheduleApiTest: {
        testDate,
        success: scheduleApiResponse.ok,
        result: scheduleApiResult
      }
    })
    
  } catch (error) {
    console.error("Error searching for doctor schedule:", error)
    return NextResponse.json({ 
      error: "Failed to search for doctor schedule",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}