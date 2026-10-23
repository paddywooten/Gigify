// Seed script: demo accounts, gigs, applications, a completed booking with
// escrow payments and reviews. Run with `npm run db:seed`.
//
// All demo accounts use the password: password123

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const json = (values: string[]) => JSON.stringify(values);
const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// 15% platform commission, matching DEFAULT_COMMISSION_RATE.
const COMMISSION_RATE = 0.15;

async function main() {
  console.log("🌱 Seeding Gigify…");

  // Clean slate (dev-only convenience).
  await prisma.$transaction([
    prisma.review.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.application.deleteMany(),
    prisma.gig.deleteMany(),
    prisma.session.deleteMany(),
    prisma.musicianProfile.deleteMany(),
    prisma.clientProfile.deleteMany(),
    prisma.user.deleteMany(),
    prisma.platformSetting.deleteMany(),
  ]);

  await prisma.platformSetting.create({
    data: { key: "commissionRate", value: String(COMMISSION_RATE) },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@gigify.test",
      passwordHash,
      name: "Alex Admin",
      role: "ADMIN",
      bio: "Gigify platform team.",
      location: "Remote",
    },
  });

  const grace = await prisma.user.create({
    data: {
      email: "church@gigify.test",
      passwordHash,
      name: "Pastor Karen Miller",
      role: "CLIENT",
      bio: "Leading worship community at Grace Community Church.",
      location: "Austin, TX",
      clientProfile: {
        create: {
          organizationName: "Grace Community Church",
          organizationType: "CHURCH",
          website: "https://gracecommunity.example.org",
        },
      },
    },
  });

  const lumen = await prisma.user.create({
    data: {
      email: "events@gigify.test",
      passwordHash,
      name: "Marcus Lee",
      role: "CLIENT",
      bio: "Producer at Lumen Events.",
      location: "Dallas, TX",
      clientProfile: {
        create: { organizationName: "Lumen Events", organizationType: "EVENT" },
      },
    },
  });

  const maya = await prisma.user.create({
    data: {
      email: "musician@gigify.test",
      passwordHash,
      name: "Maya Chen",
      role: "MUSICIAN",
      bio: "Worship leader and keys player with 10 years of church band experience. I lead contemporary services and love harmonizing with volunteers.",
      location: "Austin, TX",
      musicianProfile: {
        create: {
          headline: "Worship leader & keys",
          instruments: json(["Vocals", "Piano / Keys"]),
          genres: json(["Worship", "Contemporary Christian", "Gospel"]),
          dayRateCents: 65000,
          travelRadiusKm: 60,
          experienceYears: 10,
          sampleUrls: json(["https://soundcloud.com/mayachen/worship-set"]),
        },
      },
    },
  });

  const james = await prisma.user.create({
    data: {
      email: "james@gigify.test",
      passwordHash,
      name: "James Okafor",
      role: "MUSICIAN",
      bio: "Jazz and R&B guitarist. Trio or solo sets for weddings, galas and cocktail hours.",
      location: "Dallas, TX",
      musicianProfile: {
        create: {
          headline: "Jazz & soul guitarist",
          instruments: json(["Electric Guitar", "Acoustic Guitar"]),
          genres: json(["Jazz", "R&B / Soul", "Blues"]),
          dayRateCents: 80000,
          travelRadiusKm: 120,
          experienceYears: 14,
          sampleUrls: json(["https://soundcloud.com/jamesokafor/live-at-the-blue-room"]),
        },
      },
    },
  });

  const sofia = await prisma.user.create({
    data: {
      email: "sofia@gigify.test",
      passwordHash,
      name: "Sofía Ramírez",
      role: "MUSICIAN",
      bio: "Latin percussionist and vocalist. Available for ceremonies, festivals and bilingual events.",
      location: "San Antonio, TX",
      musicianProfile: {
        create: {
          headline: "Percussion & bilingual vocals",
          instruments: json(["Percussion", "Vocals"]),
          genres: json(["Latin", "World", "Pop"]),
          dayRateCents: 55000,
          travelRadiusKm: 150,
          experienceYears: 8,
        },
      },
    },
  });

  const daniel = await prisma.user.create({
    data: {
      email: "daniel@gigify.test",
      passwordHash,
      name: "Daniel Whitfield",
      role: "MUSICIAN",
      bio: "Session drummer for church services, acoustic sets and full band productions.",
      location: "Houston, TX",
      musicianProfile: {
        create: {
          headline: "Session & church drummer",
          instruments: json(["Drums"]),
          genres: json(["Rock", "Gospel", "Pop"]),
          dayRateCents: 45000,
          travelRadiusKm: 80,
          experienceYears: 12,
          isAvailable: false,
        },
      },
    },
  });

  // --- Gigs -----------------------------------------------------------------

  const sundayWorship = await prisma.gig.create({
    data: {
      organizerId: grace.id,
      title: "Worship band for Sunday morning services",
      description:
        "We're a contemporary congregation looking for a keys-led trio to lead two back-to-back Sunday services (9am & 11am). Set list is provided a week ahead; one rehearsal on Saturday afternoon preferred. Sound tech and PA provided.",
      gigType: "CHURCH_SERVICE",
      genres: json(["Worship", "Gospel"]),
      eventDate: days(10),
      durationHours: 4,
      location: "Austin, TX",
      venueName: "Grace Community Church",
      budgetCents: 80000,
      requirements: "Comfortable leading congregational worship. Background check required for all working with youth.",
    },
  });

  const youthNight = await prisma.gig.create({
    data: {
      organizerId: grace.id,
      title: "Youth night acoustic set",
      description:
        "Acoustic duo/set for our high-school youth night (approx. 60 students). Upbeat, family-friendly, 60 minutes of music with a short break. Pizza provided!",
      gigType: "OTHER",
      genres: json(["Pop", "Folk / Acoustic"]),
      eventDate: days(21),
      durationHours: 1.5,
      location: "Austin, TX",
      venueName: "Grace Community Church — Youth Hall",
      budgetCents: 35000,
    },
  });

  const wedding = await prisma.gig.create({
    data: {
      organizerId: lumen.id,
      title: "Wedding ceremony & cocktail hour — string duo",
      description:
        "Elegant string duo for a garden wedding: 30 min prelude, processional/recessional, and 60 min of cocktail-hour repertoire. Repertoire list shared in advance; bride has requested a specific processional arrangement.",
      gigType: "WEDDING",
      genres: json(["Classical", "Pop"]),
      eventDate: days(34),
      durationHours: 2.5,
      location: "Fort Worth, TX",
      venueName: "The Botanical Garden House",
      budgetCents: 120000,
      requirements: "Formal attire. Load-in at 3pm sharp; indoor backup in case of rain.",
    },
  });

  const gala = await prisma.gig.create({
    data: {
      organizerId: lumen.id,
      title: "Corporate gala — jazz trio",
      description:
        "Three-hour jazz trio for a 250-guest charity gala dinner. Background-appropriate volume, two 45-minute sets with a break during the keynote.",
      gigType: "CORPORATE",
      genres: json(["Jazz"]),
      eventDate: days(-6),
      durationHours: 3,
      location: "Dallas, TX",
      venueName: "The Crescent Hotel Ballroom",
      budgetCents: 150000,
    },
  });

  const festival = await prisma.gig.create({
    data: {
      organizerId: lumen.id,
      title: "Festival main stage — headline act",
      description:
        "Looking for an experienced headline act for our community arts festival main stage (2,000 attendees). 75-minute set, full backline provided, sound check at 4pm.",
      gigType: "FESTIVAL",
      genres: json(["Rock", "Pop"]),
      eventDate: days(60),
      durationHours: 1.5,
      location: "Dallas, TX",
      venueName: "Klyde Warren Park",
      budgetCents: 400000,
    },
  });

  // --- Applications ---------------------------------------------------------

  await prisma.application.create({
    data: {
      gigId: sundayWorship.id,
      musicianId: maya.id,
      message:
        "Hi Pastor Karen! I lead worship at a sister church in Round Rock and would love to help. I can lead from keys with backing vocals, and I'm comfortable with both traditional and contemporary sets.",
      proposedRateCents: 75000,
      status: "PENDING",
    },
  });

  await prisma.application.create({
    data: {
      gigId: sundayWorship.id,
      musicianId: james.id,
      message:
        "Hello! I'm primarily a jazz guitarist but grew up playing gospel — I'd be happy to fill the guitar seat for your services at the listed budget.",
      proposedRateCents: 80000,
      status: "PENDING",
    },
  });

  await prisma.application.create({
    data: {
      gigId: youthNight.id,
      musicianId: daniel.id,
      message:
        "Hey! I usually drum, but I also play acoustic guitar and lead youth worship at my own church. I can bring a compact PA if helpful.",
      proposedRateCents: 30000,
      status: "PENDING",
    },
  });

  // A second application on the youth gig so the church demo account has a
  // booking that still needs escrow funding.
  const youthAccepted = await prisma.application.create({
    data: {
      gigId: youthNight.id,
      musicianId: maya.id,
      message:
        "Hi! I'd love to play your youth night — upbeat acoustic set with singalongs, and I can learn a couple of student requests in advance.",
      proposedRateCents: 32000,
      status: "ACCEPTED",
    },
  });

  await prisma.application.create({
    data: {
      gigId: wedding.id,
      musicianId: sofia.id,
      message:
        "Hola! I perform in an acoustic duo with a classical guitarist — we cover pops, boleros and classic ceremony repertoire. Available for the 3pm load-in.",
      proposedRateCents: 110000,
      status: "PENDING",
    },
  });

  // Completed booking on the gala gig (accepted -> funded -> completed).
  const galaAccepted = await prisma.application.create({
    data: {
      gigId: gala.id,
      musicianId: james.id,
      message:
        "Thanks for the invite, Marcus. Our trio plays the standard jazz dinner book plus a few neo-soul arrangements for the keynote break. References from three DFW galas available.",
      proposedRateCents: 150000,
      status: "ACCEPTED",
    },
  });

  await prisma.application.create({
    data: {
      gigId: gala.id,
      musicianId: maya.id,
      message: "I'd love to play your gala — I can bring a keys-led trio with a jazz repertoire.",
      proposedRateCents: 140000,
      status: "REJECTED",
    },
  });

  await prisma.gig.update({ where: { id: gala.id }, data: { status: "COMPLETED" } });

  const fee = Math.round(150000 * COMMISSION_RATE);
  const booking = await prisma.booking.create({
    data: {
      gigId: gala.id,
      applicationId: galaAccepted.id,
      clientId: lumen.id,
      musicianId: james.id,
      totalCents: 150000,
      platformFeeRate: COMMISSION_RATE,
      platformFeeCents: fee,
      musicianPayoutCents: 150000 - fee,
      status: "COMPLETED",
      fundedAt: days(-12),
      startedAt: days(-6),
      completedAt: days(-6),
    },
  });

  await prisma.payment.createMany({
    data: [
      {
        bookingId: booking.id,
        payerId: lumen.id,
        amountCents: 150000,
        type: "CLIENT_FUNDING",
        status: "SUCCEEDED",
        provider: "mock",
        providerRef: "ch_demo0001",
        createdAt: days(-12),
      },
      {
        bookingId: booking.id,
        amountCents: 150000 - fee,
        type: "MUSICIAN_PAYOUT",
        status: "SUCCEEDED",
        provider: "mock",
        providerRef: "po_demo0001",
        createdAt: days(-6),
      },
      {
        bookingId: booking.id,
        amountCents: fee,
        type: "PLATFORM_FEE",
        status: "SUCCEEDED",
        provider: "mock",
        providerRef: "pf_demo0001",
        createdAt: days(-6),
      },
    ],
  });

  await prisma.review.create({
    data: {
      bookingId: booking.id,
      reviewerId: lumen.id,
      revieweeId: james.id,
      rating: 5,
      comment: "Flawless. Elegant, professional, and read the room perfectly all evening. Booking again for our spring gala.",
    },
  });

  await prisma.review.create({
    data: {
      bookingId: booking.id,
      reviewerId: james.id,
      revieweeId: lumen.id,
      rating: 5,
      comment: "Great client — clear brief, on-time load-in, and the sound engineer was a pleasure to work with.",
    },
  });

  // A pending booking to demo the escrow funding flow (church account).
  const youthFee = Math.round(32000 * COMMISSION_RATE);
  await prisma.gig.update({ where: { id: youthNight.id }, data: { status: "BOOKED" } });
  await prisma.booking.create({
    data: {
      gigId: youthNight.id,
      applicationId: youthAccepted.id,
      clientId: grace.id,
      musicianId: maya.id,
      totalCents: 32000,
      platformFeeRate: COMMISSION_RATE,
      platformFeeCents: youthFee,
      musicianPayoutCents: 32000 - youthFee,
      status: "PENDING_FUNDING",
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: james.id,
        type: "BOOKING_COMPLETED",
        title: "Gig completed — payout sent 🎉",
        body: "“Corporate gala — jazz trio” is complete. $1,275.00 has been paid out to you.",
        link: `/bookings/${booking.id}`,
        createdAt: days(-6),
      },
      {
        userId: admin.id,
        type: "WELCOME",
        title: "Admin console ready",
        body: "Review platform stats, commission settings and disputes from the Admin page.",
        link: "/admin",
      },
    ],
  });

  console.log("✅ Seed complete.");
  console.log("   Demo logins (password: password123):");
  console.log("   - admin@gigify.test   (platform admin)");
  console.log("   - church@gigify.test  (client: Grace Community Church)");
  console.log("   - events@gigify.test  (client: Lumen Events)");
  console.log("   - musician@gigify.test (musician: Maya Chen)");
  console.log("   - james@gigify.test, sofia@gigify.test, daniel@gigify.test");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
