import Foundation


public enum MfaChallengeAction: String, Codable {
    case mfa
}

public struct MfaChallenge: Codable {
    public let action: MfaChallengeAction
    public let code: String
    public let session: String
}