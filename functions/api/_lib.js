export const INDEX_KEY = "participants:index";
export const DRAW_KEY = "draw:complete";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function requireKv(env) {
  if (!env.SPY_PARTY_KV) {
    throw new Error("Missing SPY_PARTY_KV binding");
  }
  return env.SPY_PARTY_KV;
}

export async function getParticipantIds(kv) {
  const raw = await kv.get(INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function putParticipantIds(kv, ids) {
  await kv.put(INDEX_KEY, JSON.stringify([...new Set(ids)]));
}

export async function sha256(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function publicOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function makeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const ROLE_GROUPS = [
  {
    key: "bride-groom",
    type: "pair",
    slots: [
      {
        title: "The Bride",
        identity: "Runaway bride",
        mission: "Arrive in a white shirt and makeshift veil. Treat the party like it might secretly be your wedding to {{partner}}.",
        bonus: "Recruit at least two guests into your bridal party.",
        tags: ["romance", "performance"]
      },
      {
        title: "The Groom",
        identity: "Dramatic fiance",
        mission: "Give a toy or candy ring to {{partner}} in front of a group of people.",
        bonus: "Deliver a speech that sounds too emotional for the situation.",
        tags: ["romance", "performance"]
      }
    ],
    notRealPartners: true
  },
  {
    key: "fake-couple",
    type: "pair",
    slots: [
      {
        title: "Fake Couple",
        identity: "Suspicious romantic partner",
        mission: "Convince as many people as possible that you and {{partner}} are a real couple.",
        bonus: "Invent a meet-cute and disagree on the details.",
        tags: ["romance", "performance"]
      },
      {
        title: "Fake Couple",
        identity: "Suspicious romantic partner",
        mission: "Convince as many people as possible that you and {{partner}} are a real couple.",
        bonus: "Invent a meet-cute and disagree on the details.",
        tags: ["romance", "performance"]
      }
    ],
    notRealPartners: true
  },
  single("The Journalist", "Nosy party reporter", "Collect one fun fact from as many people as possible.", "Present one breaking-news update before voting.", ["performance"]),
  single("The Party Photographer", "Event photographer", "Take photos of everyone at least once.", "Capture three suspicious evidence shots.", ["camera"]),
  single("The Bartender", "Suspiciously helpful drink expert", "Open bottles, pour shots, or offer drink service without making it too obvious.", "Invent a signature drink name.", ["alcohol"]),
  single("The DJ", "Music operative", "Successfully change the music genre at least three times.", "Get one person to publicly endorse your music taste.", ["music"]),
  single("Double Agent", "Untrustworthy operative", "Secretly switch objectives with another person mid-party without being exposed.", "Make the switch sound like official agency protocol.", ["performance"]),
  single("Handler", "Mission coordinator", "Give tiny missions to other people without them realizing you are controlling the game.", "Get three people to complete your side quests.", ["performance"]),
  single("Charity Worker", "Fake activist", "Convince people to sign a petition for a fake charity or cause.", "Create a slogan for your charity.", ["performance"]),
  single("The Psychic", "Mystical consultant", "Give horoscope, tarot, or fake psychic readings to party guests.", "Correctly predict one very obvious event.", ["performance"]),
  single("Celebrity Bodyguard", "Overprotective security", "Pick one person and protect them dramatically for the night.", "Ask someone to step back from your celebrity.", ["performance"]),
  single("Professional Matchmaker", "Romance and friendship broker", "Create new friendships or couples and collect fake testimonials.", "Offer a money-back guarantee.", ["romance", "performance"]),
  single("The Wannabe Rockstar", "Washed-up celebrity", "Convince people you are famous, or used to be famous back in the day.", "Reference your imaginary tour.", ["performance"]),
  single("The David Attenborough", "Wildlife documentarian", "Film short videos of the party while narrating people like animals in nature.", "Narrate a feeding or mating ritual.", ["camera", "performance"]),
  single("Street Magician", "Bad illusionist", "Perform magic tricks. If they fail, insist the audience misunderstood the technique.", "Say 'watch closely' before something deeply unimpressive.", ["performance"]),
  single("The Artist", "Park sketch artist", "Bring a sketchbook and draw people, scenes, or suspect profiles.", "Make one sketch look unnecessarily dramatic.", []),
  single("The Divorced Dad", "Nostalgic park dad", "Always be holding a beer or soft drink and keep reminiscing about 2010.", "Tell someone things were simpler then.", ["performance", "alcohol"]),
  single("The Gym Bro", "Fitness influencer", "Use random park or party objects as exercise equipment and flex whenever possible.", "Invite someone to spot you.", ["performance"]),
  single("The Spiritualist", "Aura specialist", "Assign people aura colors and recommend stones or crystals to heal them.", "Declare one aura deeply complicated.", ["performance"]),
  single("The Astrologist", "Birth chart detective", "Guess people's star signs and do Google-assisted chart readings.", "Blame one social interaction on Mercury.", ["performance"]),
  single("Terrible Tourist", "Lost tourist", "Take awkward selfies with random objects, people, trees, drinks, and bags.", "Ask someone to photograph you with something boring.", ["camera", "performance"]),
  single("The Park Ranger", "Over-serious nature authority", "Warn people about fake park rules and local wildlife protocol.", "Issue one verbal citation.", ["performance"]),
  single("The Food Critic", "Serious culinary reviewer", "Review every snack and drink with unnecessary intensity.", "Give one item a devastating score.", ["performance"]),
  single("The Conspiracy Theorist", "Truth-seeker", "Convince people that the birthday party is a cover-up for something bigger.", "Connect three unrelated objects into one theory.", ["performance"]),
  single("The HR Manager", "Workplace professional", "Give people performance reviews based on their party behavior.", "Put someone on a fictional improvement plan.", ["performance"]),
  single("The Party Mayor", "Local official", "Make ridiculous public announcements and ceremonial decisions.", "Campaign for re-election.", ["performance"]),
  single("The Crisis PR Manager", "Reputation expert", "Help people recover from imaginary scandals.", "Convince someone to issue a public apology.", ["performance"]),
  single("The Weather Reporter", "Live correspondent", "Give dramatic weather updates throughout the party.", "Interview a witness about the sky.", ["performance"]),
  single("The Estate Agent", "Property salesperson", "Try to sell random parts of the park to guests.", "Describe a bench as a rare opportunity.", ["performance"]),
  single("The Museum Guide", "Tour leader", "Give guided tours of random objects like benches, coolers, trees, or bags.", "Ask the group to stay together.", ["performance"]),
  single("The Security Guard", "Over-serious bouncer", "Guard random zones and ask people for fake credentials.", "Deny someone entry to an imaginary VIP area.", ["performance"]),
  single("The Time Traveler", "Visitor from another era", "Act confused by modern objects and keep referencing the wrong decade.", "Warn someone about the future.", ["performance"]),
  single("The Insurance Agent", "Risk assessor", "Ask people if their activities are covered by their policy.", "Refuse coverage for one normal party action.", ["performance"]),
  single("The Spy Trainee", "New recruit", "Ask suspiciously obvious spy questions and misunderstand basic missions.", "Accidentally reveal a fake codename.", ["performance"])
];

function single(title, identity, mission, bonus, tags) {
  return {
    key: title.toLowerCase().replaceAll(" ", "-"),
    type: "single",
    slots: [{ title, identity, mission, bonus, tags }]
  };
}
