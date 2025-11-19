function applyEffect(input, output, effect, callback) {
    let cmd = ffmpeg(input);

    switch (effect) {

        // 1. Natural Male → Female (already realistic)
        case "male_to_female":
            cmd.audioFilters(
                "asetrate=44100*1.32,aresample=44100,atempo=1.02, " +
                "equalizer=f=300:t=h:w=200:g=3, " +
                "equalizer=f=3000:t=h:w=200:g=4"
            );
            break;

        // 2. Soft Woman (gentle, smooth, feminine)
        case "female_soft2":
            cmd.audioFilters(
                "asetrate=44100*1.18,aresample=44100,atempo=1.04, " +
                "equalizer=f=250:t=h:w=200:g=4, " +
                "equalizer=f=4500:t=h:w=1000:g=3, " +
                "acompressor=threshold=-20dB:ratio=3:attack=20:release=200"
            );
            break;

        // 3. Confident Woman (strong, bold, female radio voice)
        case "female_confident":
            cmd.audioFilters(
                "asetrate=44100*1.10,aresample=44100,atempo=1.02, " +
                "equalizer=f=180:t=h:w=200:g=5, " +
                "equalizer=f=3500:t=h:w=800:g=6, " +
                "acompressor=threshold=-18dB:ratio=4:attack=10:release=250"
            );
            break;

        // 4. Bright Young Girl (teenage, higher pitch, energetic)
        case "female_young":
            cmd.audioFilters(
                "asetrate=44100*1.40,aresample=44100,atempo=1.07, " +
                "equalizer=f=500:t=h:w=300:g=5, " +
                "equalizer=f=6000:t=h:w=2000:g=7"
            );
            break;

        // 5. Mature Woman (deep feminine, elegant)
        case "female_mature2":
            cmd.audioFilters(
                "asetrate=44100*1.05,aresample=44100,atempo=1.00, " +
                "equalizer=f=250:t=h:w=200:g=3, " +
                "equalizer=f=2000:t=h:w=500:g=2, " +
                "equalizer=f=8000:t=h:w=1000:g=3"
            );
            break;

        // 6. Warm Lady (emotional, smooth, warm tone)
        case "female_warm2":
            cmd.audioFilters(
                "asetrate=44100*1.15,aresample=44100,atempo=1.03, " +
                "equalizer=f=300:t=h:w=250:g=4, " +
                "equalizer=f=4000:t=h:w=900:g=5, " +
                "acompressor=threshold=-22dB:ratio=2.5:attack=15:release=180"
            );
            break;

        default:
            console.log("Unknown effect:", effect);
    }

    cmd.output(output)
        .on("end", callback)
        .on("error", err => console.error("FFmpeg error:", err))
        .run();
}
