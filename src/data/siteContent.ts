export type Memory = {
  src: string;
  alt: string;
  caption: string;
};

type SiteContent = {
  language: string;
  pageTitle: string;
  description: string;
  recipientName: string;
  senderName: string;
  theme: Record<`--${string}`, string>;
  envelope: {
    label: string;
    openLabel: string;
    hint: string;
    openingHint: string;
    liftedHint: string;
    letterLabel: string;
    sealEnabled: boolean;
    sealText: string;
    sealColor: string;
    paperColor: string;
  };
  letter: { greeting: string; paragraphs: string[]; signOff: string; closeLabel: string };
  song: { title: string; src: string; playLabel: string; pauseLabel: string; errorMessage: string };
  gallery: { heading: string; openLabel: string; closeLabel: string; dialogLabel: string; unavailableLabel: string };
  memories: Memory[];
  candle: {
    prompt: string; revealedWish: string; buttonLabel: string; hint: string; doneLabel: string;
    readyLabel: string; fallbackLabel: string; cancelLabel: string;
    requestingLabel: string; calibratingLabel: string; listeningLabel: string;
    fallbackMessage: string; extinguishingLabel: string;
    unsupportedMessage: string; deniedMessage: string; unavailableMessage: string; timeoutMessage: string;
    pausedMusicMessage: string;
  };
  finalHeading: string;
  replayLabel: string;
  finalMessage: string;
};

// Personalize here. Asset paths are relative to public/, beginning with a slash.
export const siteContent: SiteContent = {
  language: 'en',
  pageTitle: 'A letter for Arshelle',
  description: 'A birthday letter and a wish for Arshelle.',
  recipientName: 'Arshelle',
  senderName: '',
  // Optional CSS variable overrides; defaults live in styles/global.css.
  theme: {},
  envelope: {
    label: 'For Arshelle',
    openLabel: 'Open envelope',
    hint: 'Tap to open',
    openingHint: 'A little something for you',
    liftedHint: 'Tap the letter to read',
    letterLabel: 'Read your letter',
    sealEnabled: true,
    sealText: '\u2661',
    sealColor: '#cfafb1',
    paperColor: '#ffffff',
  },
  letter: {
    closeLabel: 'Back to envelope',
    greeting: 'Happy Birthday, my love! ❤️',
    paragraphs: [
      'First of all, I just want to say how happy and grateful I am na I get to spend another year of your life with you. Hindi ko man palaging nasasabi or napapakita nang maayos, I hope you know how much you mean to me and how lucky I am to have you in my life.',
      'Thank you for being you, for making my days better, and for being someone I can be myself around. Kahit hindi naman tayo palaging nakakapagkita or nakakapag-spend ng time together, I want you to know na I always appreciate every little moment I get to share with you.',
      "I know we still have so much ahead of us, and I'm really looking forward to all of it. Sana in the future, we get to spend more time together, go on dates, visit places we've never been to, and make so many memories. Kahit simpleng tambay lang or wala tayong ginagawa, basta kasama kita, I'd be more than happy.",
      "And syempre, sana **we get to grow old and ugly together HAHAHA.** Yung tipong parehas na tayong kulubot, masakit na mga likod natin, pero nag-aasaran at nagtatawanan pa rin tayo. I hope that even after so many years, we'll still choose each other, just like we do now.",
      "I know things won't always be perfect, but I hope we continue to grow, learn, and become better people together. I want to be there for you, not just during your happiest days, but especially when things get difficult.",
      'On your special day, I wish you nothing but happiness, love, and success. Sana matupad mo lahat ng dreams mo, and I hope I get to be beside you, supporting and cheering you on every step of the way.',
      "Happy birthday again, love! Here's to more time together, more memories, more kulitans, and hopefully, a lifetime of us.",
      '**I love you so much, always. ❤️**',
    ],
    signOff: '',
  },
  song: {
    title: 'Our song',
    src: '', // Add /audio/our-song.mp3 only after supplying a licensed file.
    playLabel: 'Play our song',
    pauseLabel: 'Pause our song',
    errorMessage: 'The song could not be played. You can try again or keep reading.',
  },
  gallery: {
    heading: 'A few moments I love',
    openLabel: 'Enlarge photo',
    closeLabel: 'Back to letter',
    dialogLabel: 'Memory photograph',
    unavailableLabel: 'Photo unavailable',
  },
  memories: [],
  candle: {
    prompt: 'Make a wish',
    buttonLabel: 'Blow out the candle',
    hint: 'Close your eyes, make a wish, and blow out the candle. \u2661',
    doneLabel: 'Candle blown out. A wish for you.',
    readyLabel: "I'm ready",
    fallbackLabel: 'Tap to blow instead',
    cancelLabel: 'Cancel listening',
    requestingLabel: 'Waiting for microphone permission…',
    calibratingLabel: 'Getting ready…',
    listeningLabel: 'Blow gently toward your microphone…',
    fallbackMessage: "We couldn't listen this time. You can tap to blow instead.",
    unsupportedMessage: "Microphone listening isn't supported here. You can tap to blow instead.",
    deniedMessage: 'Microphone access is off. You can tap to blow instead.',
    unavailableMessage: "We couldn't access a microphone. You can tap to blow instead.",
    timeoutMessage: "Let's try a tap instead. Your microphone is no longer in use.",
    pausedMusicMessage: 'Your song was paused for your wish. Press play whenever you are ready.',
    extinguishingLabel: 'The candle is going out…',
    revealedWish: 'I hope this year gives you so many reasons to smile.',
  },
  finalMessage: '',
  finalHeading: '',
  replayLabel: 'Open again',
};
