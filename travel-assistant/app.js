const STORAGE_KEY = "wayfinder.trips.v1";

const destinationIdeas = [
  {
    id: "banff",
    name: "Banff, Alberta",
    mode: "Flight + rental car",
    hours: 8.5,
    lowCost: 6800,
    highCost: 9600,
    tags: ["mountains", "lakes", "cooler weather"],
    pitch: "Big scenery, resort comfort, lake days, and strong summer hiking without leaving North America.",
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "asheville",
    name: "Asheville, North Carolina",
    mode: "Drive",
    hours: 9.5,
    lowCost: 3600,
    highCost: 6500,
    tags: ["food", "mountains", "easy drive"],
    pitch: "A lower-friction road trip with restaurants, Blue Ridge views, breweries, and flexible pacing.",
    image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "santa-fe",
    name: "Santa Fe, New Mexico",
    mode: "Flight + rental car",
    hours: 7,
    lowCost: 5200,
    highCost: 8300,
    tags: ["art", "spa", "food"],
    pitch: "Strong restaurants, design-forward hotels, desert drives, galleries, and slower mornings.",
    image: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "30a",
    name: "30A, Florida",
    mode: "Drive",
    hours: 4.5,
    lowCost: 4200,
    highCost: 9800,
    tags: ["beach", "restaurants", "low travel load"],
    pitch: "Beach houses, quick travel, easy dinner planning, and lots of room to keep the trip relaxed.",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "mexico-city",
    name: "Mexico City",
    mode: "Flight",
    hours: 6.5,
    lowCost: 4700,
    highCost: 8500,
    tags: ["food", "culture", "walkable"],
    pitch: "A high-value food and culture trip with excellent hotels, museums, and guided day excursions.",
    image: "https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "chicago",
    name: "Chicago, Illinois",
    mode: "Flight",
    hours: 4,
    lowCost: 4300,
    highCost: 7800,
    tags: ["food", "architecture", "summer city"],
    pitch: "Short travel day, lakefront energy, strong restaurant inventory, hotels, museums, and shows.",
    image: "https://images.unsplash.com/photo-1494522855154-9297ac14b55f?auto=format&fit=crop&w=900&q=80"
  }
];

const demoTrips = [
  {
    id: "trip-banff-2026",
    name: "Banff Summer Reset",
    homeBase: "New Orleans, LA",
    destination: "Banff, Alberta",
    startDate: "2026-06-24",
    endDate: "2026-06-29",
    adults: 2,
    maxTravelHours: 10,
    budget: 10000,
    status: "Booked",
    notes: "Booked core Expedia itinerary. Build the rest around lakes, one nicer dinner, and weather-flexible excursions.",
    tasks: [
      { id: "task-1", title: "Compare Lake Louise shuttle windows", status: "Ready to research" },
      { id: "task-2", title: "Prepare three Banff dinner reservations for review", status: "Draft" },
      { id: "task-3", title: "Watch arrival day drive time from Calgary", status: "Monitor" }
    ],
    bookings: [
      {
        id: "booking-1",
        type: "Flight",
        date: "2026-06-24",
        name: "Expedia flight itinerary",
        cost: 1800,
        status: "Confirmed",
        notes: "MSY to YYC. Add confirmation number after import."
      },
      {
        id: "booking-2",
        type: "Hotel",
        date: "2026-06-24",
        name: "Banff hotel hold",
        cost: 4200,
        status: "Booked",
        notes: "Five nights. Check cancellation window."
      },
      {
        id: "booking-3",
        type: "Rental car",
        date: "2026-06-24",
        name: "Calgary airport rental car",
        cost: 780,
        status: "Booked",
        notes: "Pickup after arrival. Return June 29."
      }
    ],
    itinerary: [
      {
        id: "item-1",
        date: "2026-06-24",
        time: "16:30",
        title: "Arrive in Calgary and pick up rental car",
        place: "YYC Calgary International Airport"
      },
      {
        id: "item-2",
        date: "2026-06-25",
        time: "09:00",
        title: "Lake Louise morning block",
        place: "Lake Louise"
      },
      {
        id: "item-3",
        date: "2026-06-26",
        time: "18:30",
        title: "Dinner reservation shortlist",
        place: "Banff Avenue"
      }
    ],
    photos: []
  }
];

let trips = loadTrips();
let activeTripId = trips[0]?.id;

const elements = {
  tripList: document.querySelector("#tripList"),
  tripTitle: document.querySelector("#tripTitle"),
  tripStatus: document.querySelector("#tripStatus"),
  summaryDates: document.querySelector("#summaryDates"),
  summaryTravelers: document.querySelector("#summaryTravelers"),
  summaryBudget: document.querySelector("#summaryBudget"),
  summaryNext: document.querySelector("#summaryNext"),
  tripForm: document.querySelector("#tripForm"),
  tripName: document.querySelector("#tripName"),
  homeBase: document.querySelector("#homeBase"),
  startDate: document.querySelector("#startDate"),
  endDate: document.querySelector("#endDate"),
  adults: document.querySelector("#adults"),
  maxTravelHours: document.querySelector("#maxTravelHours"),
  budget: document.querySelector("#budget"),
  status: document.querySelector("#status"),
  notes: document.querySelector("#notes"),
  destinationGrid: document.querySelector("#destinationGrid"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  itineraryForm: document.querySelector("#itineraryForm"),
  itemDate: document.querySelector("#itemDate"),
  itemTime: document.querySelector("#itemTime"),
  itemTitle: document.querySelector("#itemTitle"),
  itemPlace: document.querySelector("#itemPlace"),
  itineraryDays: document.querySelector("#itineraryDays"),
  bookingForm: document.querySelector("#bookingForm"),
  bookingType: document.querySelector("#bookingType"),
  bookingDate: document.querySelector("#bookingDate"),
  bookingName: document.querySelector("#bookingName"),
  bookingCost: document.querySelector("#bookingCost"),
  bookingNotes: document.querySelector("#bookingNotes"),
  bookingList: document.querySelector("#bookingList"),
  photoInput: document.querySelector("#photoInput"),
  photoGrid: document.querySelector("#photoGrid"),
  newTripButton: document.querySelector("#newTripButton"),
  seedButton: document.querySelector("#seedButton"),
  clearButton: document.querySelector("#clearButton"),
  saveButton: document.querySelector("#saveButton"),
  exportButton: document.querySelector("#exportButton"),
  refreshIdeasButton: document.querySelector("#refreshIdeasButton"),
  buildItineraryButton: document.querySelector("#buildItineraryButton"),
  emptyStateTemplate: document.querySelector("#emptyStateTemplate")
};

function loadTrips() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return structuredClone(demoTrips);
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length ? parsed : structuredClone(demoTrips);
  } catch {
    return structuredClone(demoTrips);
  }
}

function saveTrips() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

function activeTrip() {
  return trips.find((trip) => trip.id === activeTripId) || trips[0];
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute || 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function render() {
  if (!trips.length) {
    trips = structuredClone(demoTrips);
    activeTripId = trips[0].id;
  }

  const trip = activeTrip();
  activeTripId = trip.id;
  renderTripList(trip);
  renderSummary(trip);
  renderForm(trip);
  renderTasks(trip);
  renderIdeas(trip);
  renderBookings(trip);
  renderItinerary(trip);
  renderPhotos(trip);
}

function renderTripList(active) {
  elements.tripList.innerHTML = "";
  trips.forEach((trip) => {
    const button = document.createElement("button");
    button.className = `trip-button${trip.id === active.id ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <strong>${escapeHtml(trip.name)}</strong>
      <span>${escapeHtml(trip.destination || "No destination yet")} · ${formatDate(trip.startDate)}</span>
    `;
    button.addEventListener("click", () => {
      activeTripId = trip.id;
      render();
    });
    elements.tripList.append(button);
  });
}

function renderSummary(trip) {
  const next = [...trip.itinerary]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const spent = trip.bookings.reduce((sum, booking) => sum + Number(booking.cost || 0), 0);
  const remaining = Number(trip.budget || 0) - spent;

  elements.tripTitle.textContent = trip.destination ? `${trip.name}: ${trip.destination}` : trip.name;
  elements.tripStatus.textContent = trip.status;
  elements.summaryDates.textContent = `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`;
  elements.summaryTravelers.textContent = `${trip.adults} adult${Number(trip.adults) === 1 ? "" : "s"}`;
  elements.summaryBudget.textContent = `${money(remaining)} left`;
  elements.summaryNext.textContent = next ? `${formatDate(next.date)}, ${formatTime(next.time)}` : "Nothing scheduled";
}

function renderForm(trip) {
  elements.tripName.value = trip.name;
  elements.homeBase.value = trip.homeBase;
  elements.startDate.value = trip.startDate;
  elements.endDate.value = trip.endDate;
  elements.adults.value = trip.adults;
  elements.maxTravelHours.value = trip.maxTravelHours;
  elements.budget.value = trip.budget;
  elements.status.value = trip.status;
  elements.notes.value = trip.notes || "";
  elements.itemDate.value = trip.startDate;
  elements.bookingDate.value = trip.startDate;
}

function renderTasks(trip) {
  elements.taskList.innerHTML = "";
  if (!trip.tasks.length) {
    elements.taskList.append(emptyState());
    return;
  }

  trip.tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "task";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <div class="meta">Assistant action</div>
      </div>
      <button class="status-pill" type="button">${escapeHtml(task.status)}</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      task.status = nextTaskStatus(task.status);
      saveTrips();
      renderTasks(trip);
      toast(`Task moved to ${task.status}`);
    });
    elements.taskList.append(row);
  });
}

function nextTaskStatus(status) {
  const statuses = ["Draft", "Ready to research", "Ready for review", "Done"];
  const index = statuses.indexOf(status);
  return statuses[(index + 1) % statuses.length] || statuses[0];
}

function renderIdeas(trip) {
  elements.destinationGrid.innerHTML = "";
  const ideas = destinationIdeas
    .map((idea) => ({ ...idea, fit: scoreIdea(idea, trip) }))
    .filter((idea) => idea.hours <= Number(trip.maxTravelHours || 99) && idea.lowCost <= Number(trip.budget || 0))
    .sort((a, b) => b.fit - a.fit);

  if (!ideas.length) {
    elements.destinationGrid.append(emptyState("No ideas match", "Increase the travel window or budget."));
    return;
  }

  ideas.forEach((idea) => {
    const card = document.createElement("article");
    card.className = "destination-card";
    card.innerHTML = `
      <div class="destination-media" style="background-image: url('${idea.image}')">
        <span class="fit-badge">${idea.fit}% fit</span>
      </div>
      <div class="destination-body">
        <div>
          <h3>${escapeHtml(idea.name)}</h3>
          <p>${escapeHtml(idea.pitch)}</p>
        </div>
        <div class="facts">
          <span class="fact">${idea.hours} hrs</span>
          <span class="fact">${money(idea.lowCost)}-${money(idea.highCost)}</span>
          <span class="fact">${escapeHtml(idea.mode)}</span>
        </div>
        <div class="tag-row">
          ${idea.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <button class="secondary-button" type="button">Add to plan</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", () => {
      trip.destination = idea.name;
      trip.tasks.unshift({
        id: uid("task"),
        title: `Prepare booking research for ${idea.name}`,
        status: "Ready to research"
      });
      saveTrips();
      render();
      toast(`${idea.name} added to the trip`);
    });
    elements.destinationGrid.append(card);
  });
}

function scoreIdea(idea, trip) {
  const budget = Number(trip.budget || 0);
  const maxHours = Number(trip.maxTravelHours || 1);
  const budgetScore = Math.max(0, Math.min(40, ((budget - idea.lowCost) / Math.max(budget, 1)) * 70));
  const timeScore = Math.max(0, Math.min(35, ((maxHours - idea.hours) / Math.max(maxHours, 1)) * 60));
  const valueScore = idea.highCost <= budget ? 25 : 12;
  return Math.round(Math.min(98, 45 + budgetScore + timeScore + valueScore));
}

function renderBookings(trip) {
  elements.bookingList.innerHTML = "";
  if (!trip.bookings.length) {
    elements.bookingList.append(emptyState());
    return;
  }

  [...trip.bookings]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((booking) => {
      const row = document.createElement("div");
      row.className = "booking";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(booking.name)}</strong>
          <div class="meta">${escapeHtml(booking.type)} · ${formatDate(booking.date)} · ${money(booking.cost)}</div>
          <div class="meta">${escapeHtml(booking.notes || "")}</div>
        </div>
        <span class="status-pill">${escapeHtml(booking.status || "Planned")}</span>
      `;
      elements.bookingList.append(row);
    });
}

function renderItinerary(trip) {
  elements.itineraryDays.innerHTML = "";
  if (!trip.itinerary.length) {
    elements.itineraryDays.append(emptyState());
    return;
  }

  const days = groupBy(trip.itinerary, "date");
  Object.keys(days)
    .sort()
    .forEach((date) => {
      const card = document.createElement("article");
      card.className = "day-card";
      const items = days[date].sort((a, b) => a.time.localeCompare(b.time));
      card.innerHTML = `
        <h3>${formatDate(date)}</h3>
        ${items
          .map(
            (item) => `
              <div class="itinerary-item">
                <time>${formatTime(item.time)}</time>
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.place || "Place TBD")}</span>
                </div>
              </div>
            `
          )
          .join("")}
      `;
      elements.itineraryDays.append(card);
    });
}

function renderPhotos(trip) {
  elements.photoGrid.innerHTML = "";
  if (!trip.photos.length) {
    elements.photoGrid.append(emptyState("No photos saved", "Waiting for trip moments."));
    return;
  }

  trip.photos.forEach((photo) => {
    const card = document.createElement("figure");
    card.className = "photo-card";
    card.innerHTML = `
      <img src="${photo.dataUrl}" alt="${escapeHtml(photo.name)}">
      <span>${escapeHtml(photo.name)}</span>
    `;
    elements.photoGrid.append(card);
  });
}

function groupBy(items, key) {
  return items.reduce((grouped, item) => {
    const value = item[key];
    grouped[value] = grouped[value] || [];
    grouped[value].push(item);
    return grouped;
  }, {});
}

function emptyState(title = "No items yet", message = "Waiting for trip details.") {
  const node = elements.emptyStateTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("strong").textContent = title;
  node.querySelector("span").textContent = message;
  return node;
}

function updateActiveTrip(updates) {
  const trip = activeTrip();
  Object.assign(trip, updates);
  saveTrips();
  render();
}

function buildItinerary(trip) {
  const existingTitles = new Set(trip.itinerary.map((item) => item.title));
  const generated = [
    {
      date: trip.startDate,
      time: "09:00",
      title: "Departure and travel buffer",
      place: trip.homeBase
    },
    {
      date: trip.startDate,
      time: "17:30",
      title: "Check in and easy dinner",
      place: trip.destination || "Destination"
    },
    {
      date: addDays(trip.startDate, 1),
      time: "09:30",
      title: "Signature morning activity",
      place: trip.destination || "Destination"
    },
    {
      date: addDays(trip.endDate, -1),
      time: "18:30",
      title: "Final night dinner",
      place: trip.destination || "Destination"
    },
    {
      date: trip.endDate,
      time: "10:00",
      title: "Checkout and return travel",
      place: trip.destination || "Destination"
    }
  ];

  generated.forEach((item) => {
    if (!existingTitles.has(item.title)) {
      trip.itinerary.push({ id: uid("item"), ...item });
    }
  });
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function exportCalendar(trip) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wayfinder//Travel Assistant//EN"
  ];

  trip.itinerary.forEach((item) => {
    const start = `${item.date.replaceAll("-", "")}T${item.time.replace(":", "")}00`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@wayfinder.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${start}`,
      `SUMMARY:${escapeCalendar(item.title)}`,
      `LOCATION:${escapeCalendar(item.place || "")}`,
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${trip.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeCalendar(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const oldToast = document.querySelector(".toast");
  oldToast?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2600);
}

elements.tripForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateActiveTrip({
    name: elements.tripName.value.trim(),
    homeBase: elements.homeBase.value.trim(),
    startDate: elements.startDate.value,
    endDate: elements.endDate.value,
    adults: Number(elements.adults.value),
    maxTravelHours: Number(elements.maxTravelHours.value),
    budget: Number(elements.budget.value),
    status: elements.status.value,
    notes: elements.notes.value.trim()
  });
  toast("Trip brief saved");
});

elements.newTripButton.addEventListener("click", () => {
  const trip = {
    id: uid("trip"),
    name: "New trip",
    homeBase: "New Orleans, LA",
    destination: "",
    startDate: "2026-06-24",
    endDate: "2026-06-29",
    adults: 2,
    maxTravelHours: 10,
    budget: 10000,
    status: "Idea",
    notes: "",
    tasks: [],
    bookings: [],
    itinerary: [],
    photos: []
  };
  trips.unshift(trip);
  activeTripId = trip.id;
  saveTrips();
  render();
  toast("New trip created");
});

elements.seedButton.addEventListener("click", () => {
  trips = structuredClone(demoTrips);
  activeTripId = trips[0].id;
  saveTrips();
  render();
  toast("Demo data restored");
});

elements.clearButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  trips = structuredClone(demoTrips);
  activeTripId = trips[0].id;
  render();
  toast("Local data cleared");
});

elements.saveButton.addEventListener("click", () => {
  saveTrips();
  toast("Saved locally");
});

elements.exportButton.addEventListener("click", () => exportCalendar(activeTrip()));

elements.refreshIdeasButton.addEventListener("click", () => {
  renderIdeas(activeTrip());
  toast("Ideas refreshed");
});

elements.buildItineraryButton.addEventListener("click", () => {
  const trip = activeTrip();
  buildItinerary(trip);
  saveTrips();
  render();
  toast("Itinerary draft updated");
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.taskInput.value.trim();
  if (!title) return;
  activeTrip().tasks.unshift({ id: uid("task"), title, status: "Draft" });
  elements.taskInput.value = "";
  saveTrips();
  renderTasks(activeTrip());
});

elements.bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const trip = activeTrip();
  trip.bookings.unshift({
    id: uid("booking"),
    type: elements.bookingType.value,
    date: elements.bookingDate.value,
    name: elements.bookingName.value.trim(),
    cost: Number(elements.bookingCost.value || 0),
    status: "Planned",
    notes: elements.bookingNotes.value.trim()
  });
  elements.bookingName.value = "";
  elements.bookingCost.value = "";
  elements.bookingNotes.value = "";
  saveTrips();
  render();
  toast("Booking added");
});

elements.itineraryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const trip = activeTrip();
  trip.itinerary.push({
    id: uid("item"),
    date: elements.itemDate.value,
    time: elements.itemTime.value,
    title: elements.itemTitle.value.trim(),
    place: elements.itemPlace.value.trim()
  });
  elements.itemTitle.value = "";
  elements.itemPlace.value = "";
  saveTrips();
  render();
  toast("Itinerary item added");
});

elements.photoInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  const trip = activeTrip();

  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    trip.photos.unshift({
      id: uid("photo"),
      name: file.name,
      addedAt: new Date().toISOString(),
      dataUrl
    });
  }

  elements.photoInput.value = "";
  saveTrips();
  renderPhotos(trip);
  toast(`${files.length} photo${files.length === 1 ? "" : "s"} added`);
});

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

render();
