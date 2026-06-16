package com.aws.blocks.kotlin

object NamingUtils {
    fun toPascalCase(name: String): String {
        if (name.isEmpty()) return name
        return name
            .split(Regex("[_\\-]"))
            .joinToString("") { segment ->
                if (segment.isEmpty()) ""
                else if (segment.all { it.isUpperCase() || it.isDigit() }) {
                    segment[0].uppercaseChar() + segment.substring(1).lowercase()
                } else {
                    segment[0].uppercaseChar() + segment.substring(1)
                }
            }
            .let { result ->
                if (result.isEmpty()) result
                else result[0].uppercaseChar() + result.substring(1)
            }
    }

    fun toCamelCase(name: String): String {
        val pascal = toPascalCase(name)
        return if (pascal.isEmpty()) pascal else pascal[0].lowercaseChar() + pascal.substring(1)
    }
}
