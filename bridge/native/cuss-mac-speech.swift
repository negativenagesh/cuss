import Foundation
import Speech

// CUSS speech helper: `cuss-mac-speech <audio-file> [locale]` → prints the transcription.
// Uses SFSpeechURLRecognitionRequest directly on m4a/wav/caf so no ffmpeg is required.
let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: cuss-mac-speech <audio-file> [locale]\n".data(using: .utf8)!)
    exit(2)
}
let path = args[1]
let localeId = args.count >= 3 ? args[2] : "en-US"
let sema = DispatchSemaphore(value: 0)
var output = ""
SFSpeechRecognizer.requestAuthorization { status in
    guard status == .authorized, let rec = SFSpeechRecognizer(locale: Locale(identifier: localeId)), rec.isAvailable else {
        FileHandle.standardError.write("speech recognizer unavailable (status \(status.rawValue))\n".data(using: .utf8)!)
        sema.signal()
        return
    }
    let req = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: path))
    req.shouldReportPartialResults = true
    if #available(macOS 13, *) { req.addsPunctuation = true }
    rec.recognitionTask(with: req) { result, error in
        if let r = result {
            output = r.bestTranscription.formattedString
            if r.isFinal { sema.signal() }
        } else if error != nil {
            sema.signal()
        }
    }
}
_ = sema.wait(timeout: .now() + 14)
print(output)
