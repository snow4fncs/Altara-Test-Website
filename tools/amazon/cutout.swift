// Cuts the subject out of a photo with Apple's Vision framework (macOS 14+) and writes a PNG with transparency.
// usage: swift tools/amazon/cutout.swift <in.png> <out.png> [instance]   (instance = one subject only, 1-based, when Vision finds several)
import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: cutout.swift in out [instanceIndex]"); exit(1) }
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
guard let image = CIImage(contentsOf: inURL) else { print("cannot read \(args[1])"); exit(1) }

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: image)
try handler.perform([request])
guard let result = request.results?.first else { print("no subject found"); exit(1) }
let pick: IndexSet = args.count > 3 ? IndexSet(integer: Int(args[3])!) : result.allInstances
let maskBuffer = try result.generateScaledMaskForImage(forInstances: pick, from: handler)
let mask = CIImage(cvPixelBuffer: maskBuffer)

let blend = CIFilter.blendWithMask()
blend.inputImage = image
blend.backgroundImage = CIImage(color: .clear).cropped(to: image.extent)
blend.maskImage = mask
let ctx = CIContext()
try ctx.writePNGRepresentation(of: blend.outputImage!, to: outURL, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("instances \(result.allInstances.count) -> \(args[2])")
