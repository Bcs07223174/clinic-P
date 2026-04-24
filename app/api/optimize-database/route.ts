import { connectToDatabase } from "@/lib/mongodb"
import { NextResponse } from "next/server"

/**
 * Database Optimization Script for Doctor Schedules
 * 
 * This script:
 * 1. Creates optimized compound indexes for slot loading
 * 2. Analyzes existing data structure
 * 3. Provides performance optimization recommendations
 * 4. Tests index effectiveness
 */

export async function POST() {
  try {
    const db = await connectToDatabase()
    const collection = db.collection("doctor_schedules")
    
    console.log("🚀 Starting database optimization for doctor_schedules...")
    
    // 1. Analyze current collection
    const analysis = await analyzeCollection(collection)
    
    // 2. Create optimized indexes
    const indexResults = await createOptimizedIndexes(collection)
    
    // 3. Test index performance
    const performanceTests = await testIndexPerformance(collection)
    
    // 4. Optimize existing data
    const dataOptimization = await optimizeExistingData(collection)
    
    return NextResponse.json({
      success: true,
      analysis,
      indexResults,
      performanceTests,
      dataOptimization,
      recommendations: getOptimizationRecommendations(analysis)
    })
    
  } catch (error) {
    console.error("Database optimization error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const db = await connectToDatabase()
    const collection = db.collection("doctor_schedules")
    
    // Get current indexes
    const indexes = await collection.listIndexes().toArray()
    
    // Get collection stats using db.command (collection.stats() removed in MongoDB driver 6)
    const stats = await db.command({ collStats: "doctor_schedules" })
    
    // Sample documents to analyze structure
    const sampleDocs = await collection.find({}).limit(5).toArray()
    
    return NextResponse.json({
      success: true,
      currentIndexes: indexes,
      collectionStats: {
        count: stats.count,
        avgObjSize: stats.avgObjSize,
        storageSize: stats.storageSize,
        totalIndexSize: stats.totalIndexSize
      },
      sampleDocuments: sampleDocs.map(doc => ({
        _id: doc._id,
        doctorId: doc.doctorId,
        hasWeekRange: !!(doc.weekStart && doc.weekEnd),
        dayCount: doc.days?.length || 0,
        hasPreCalculatedSlots: !!(doc.days?.[0]?.morningSlots || doc.days?.[0]?.eveningSlots),
        structure: Object.keys(doc)
      }))
    })
    
  } catch (error) {
    console.error("Error getting optimization status:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

async function analyzeCollection(collection: any) {
  const totalDocs = await collection.countDocuments()
  
  // Analyze data patterns
  const pipeline = [
    {
      $group: {
        _id: null,
        totalDocs: { $sum: 1 },
        weekSpecificDocs: {
          $sum: {
            $cond: [
              { $and: [{ $exists: "$weekStart" }, { $exists: "$weekEnd" }] },
              1,
              0
            ]
          }
        },
        generalDocs: {
          $sum: {
            $cond: [
              { $and: [{ $not: { $exists: "$weekStart" } }, { $not: { $exists: "$weekEnd" } }] },
              1,
              0
            ]
          }
        },
        avgDaysPerSchedule: { $avg: { $size: "$days" } },
        uniqueDoctors: { $addToSet: "$doctorId" }
      }
    },
    {
      $project: {
        totalDocs: 1,
        weekSpecificDocs: 1,
        generalDocs: 1,
        avgDaysPerSchedule: 1,
        uniqueDoctorCount: { $size: "$uniqueDoctors" }
      }
    }
  ]
  
  const analysis = await collection.aggregate(pipeline).toArray()
  
  // Check for pre-calculated slots
  const slotsAnalysis = await collection.aggregate([
    {
      $project: {
        hasPreCalculatedSlots: {
          $or: [
            { $exists: "$days.morningSlots" },
            { $exists: "$days.eveningSlots" }
          ]
        }
      }
    },
    {
      $group: {
        _id: "$hasPreCalculatedSlots",
        count: { $sum: 1 }
      }
    }
  ]).toArray()
  
  return {
    overview: analysis[0] || {},
    slotsAnalysis,
    totalDocuments: totalDocs
  }
}

async function createOptimizedIndexes(collection: any) {
  const indexResults = []
  
  const indexes = [
    {
      name: "doctorId_dayOfWeek_optimized",
      spec: { doctorId: 1, "days.dayOfWeek": 1 },
      options: { background: true, name: "doctorId_dayOfWeek_optimized" }
    },
    {
      name: "doctorId_weekRange_optimized", 
      spec: { doctorId: 1, weekStart: 1, weekEnd: 1 },
      options: { background: true, name: "doctorId_weekRange_optimized" }
    },
    {
      name: "doctorId_general_optimized",
      spec: { doctorId: 1, weekStart: 1 },
      options: { 
        background: true, 
        name: "doctorId_general_optimized",
        partialFilterExpression: { weekStart: { $exists: false } }
      }
    },
    {
      name: "doctorId_compound_optimized",
      spec: { doctorId: 1, "days.dayOfWeek": 1, weekStart: 1, weekEnd: 1 },
      options: { 
        background: true, 
        name: "doctorId_compound_optimized",
        sparse: true
      }
    }
  ]
  
  for (const index of indexes) {
    try {
      await collection.createIndex(index.spec, index.options)
      indexResults.push({
        name: index.name,
        status: "created",
        spec: index.spec
      })
    } catch (error) {
      indexResults.push({
        name: index.name,
        status: "exists_or_error",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }
  
  return indexResults
}

async function testIndexPerformance(collection: any) {
  const testDoctorId = "68c1b0a8290666380fd5fa36" // Use a known doctor ID
  const testDate = new Date("2025-09-15")
  const testDayOfWeek = "Monday"
  
  const tests = []
  
  // Test 1: Doctor + Day query
  const test1Start = Date.now()
  const result1 = await collection.findOne({
    doctorId: testDoctorId,
    "days.dayOfWeek": testDayOfWeek
  }).explain("executionStats")
  const test1Time = Date.now() - test1Start
  
  tests.push({
    testName: "Doctor + DayOfWeek Query",
    executionTime: test1Time,
    documentsExamined: result1.executionStats.totalDocsExamined,
    indexUsed: result1.executionStats.executionStages?.indexName || "none"
  })
  
  // Test 2: Doctor + Date Range query
  const test2Start = Date.now()
  const result2 = await collection.findOne({
    doctorId: testDoctorId,
    weekStart: { $lte: testDate },
    weekEnd: { $gte: testDate }
  }).explain("executionStats")
  const test2Time = Date.now() - test2Start
  
  tests.push({
    testName: "Doctor + Date Range Query",
    executionTime: test2Time,
    documentsExamined: result2.executionStats.totalDocsExamined,
    indexUsed: result2.executionStats.executionStages?.indexName || "none"
  })
  
  return tests
}

async function optimizeExistingData(collection: any) {
  // Find documents that could benefit from optimization
  const unoptimizedDocs = await collection.find({
    $or: [
      { "days.morningSlots": { $exists: false } },
      { "days.eveningSlots": { $exists: false } }
    ]
  }).limit(10).toArray()
  
  let optimizedCount = 0
  
  for (const doc of unoptimizedDocs) {
    if (doc.days && Array.isArray(doc.days)) {
      const optimizedDays = doc.days.map((day: any) => {
        // Generate pre-calculated slots if they don't exist
        if (!day.morningSlots && day.morningStart && day.morningEnd) {
          day.morningSlots = generateTimeSlots(day.morningStart, day.morningEnd, parseInt(day.slotduration || "30"))
        }
        
        if (!day.eveningSlots && day.eveningStart && day.eveningEnd) {
          day.eveningSlots = generateTimeSlots(day.eveningStart, day.eveningEnd, parseInt(day.slotduration || "30"))
        }
        
        return day
      })
      
      await collection.updateOne(
        { _id: doc._id },
        { 
          $set: { 
            days: optimizedDays,
            lastOptimized: new Date()
          }
        }
      )
      
      optimizedCount++
    }
  }
  
  return {
    documentsOptimized: optimizedCount,
    totalUnoptimized: unoptimizedDocs.length
  }
}

function generateTimeSlots(startTime: string, endTime: string, durationMinutes: number): string[] {
  const slots = []
  const start = new Date(`2000-01-01T${startTime}:00`)
  const end = new Date(`2000-01-01T${endTime}:00`)
  
  let current = new Date(start)
  
  while (current < end) {
    slots.push(current.toTimeString().slice(0, 5))
    current.setMinutes(current.getMinutes() + durationMinutes)
  }
  
  return slots
}

function getOptimizationRecommendations(analysis: any) {
  const recommendations = []
  
  if (analysis.overview.weekSpecificDocs > analysis.overview.generalDocs) {
    recommendations.push({
      type: "indexing",
      priority: "high",
      message: "Most schedules are week-specific. Prioritize (doctorId, weekStart, weekEnd) index."
    })
  }
  
  if (analysis.overview.avgDaysPerSchedule > 5) {
    recommendations.push({
      type: "query_optimization",
      priority: "medium", 
      message: "Use $elemMatch for day queries to reduce document scanning."
    })
  }
  
  recommendations.push({
    type: "caching",
    priority: "high",
    message: "Implement Redis caching for frequently accessed doctor schedules."
  })
  
  recommendations.push({
    type: "pre_calculation",
    priority: "medium",
    message: "Pre-calculate time slots during schedule creation to improve query performance."
  })
  
  return recommendations
}