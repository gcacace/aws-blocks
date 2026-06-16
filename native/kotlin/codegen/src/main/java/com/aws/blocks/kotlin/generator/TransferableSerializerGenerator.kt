package com.aws.blocks.kotlin.generator

import com.aws.blocks.kotlin.model.ResolvedType
import com.squareup.kotlinpoet.ClassName
import com.squareup.kotlinpoet.FunSpec
import com.squareup.kotlinpoet.KModifier
import com.squareup.kotlinpoet.ParameterizedTypeName.Companion.parameterizedBy
import com.squareup.kotlinpoet.PropertySpec
import com.squareup.kotlinpoet.TypeName
import com.squareup.kotlinpoet.TypeSpec

class TransferableSerializerGenerator(
    private val packageName: String,
) {
    data class TransferableEntry(
        val transferableName: String,
        val typeArgs: List<ResolvedType>,
        val serializerName: String,
        val returnType: TypeName,
    )

    fun generateSerializerObject(entry: TransferableEntry): TypeSpec {
        val objectBuilder = TypeSpec.objectBuilder(entry.serializerName)
            .addSuperinterface(ClassNames.kSerializer.parameterizedBy(entry.returnType))

        objectBuilder.addProperty(
            PropertySpec.builder("descriptor", ClassNames.serialDescriptor)
                .addModifiers(KModifier.OVERRIDE)
                .initializer("%M(%S)", MemberNames.buildClassSerialDescriptor, entry.serializerName)
                .build()
        )

        objectBuilder.addFunction(generateDeserialize(entry))
        objectBuilder.addFunction(generateSerialize(entry))

        return objectBuilder.build()
    }

    private fun generateDeserialize(entry: TransferableEntry): FunSpec {
        val funBuilder = FunSpec.builder("deserialize")
            .addModifiers(KModifier.OVERRIDE)
            .addParameter("decoder", ClassNames.decoder)
            .returns(entry.returnType)
            .addStatement("val element = (decoder as %T).decodeJsonElement()", ClassNames.jsonDecoder)

        when (entry.transferableName) {
            "realtime/channel" -> {
                if (entry.typeArgs.isNotEmpty()) {
                    val typeArgClassName = resolveTypeArgClassName(entry.typeArgs.first())
                    funBuilder.addStatement(
                        "return %T.fromJson(element) { %T.%M<%T>(it) }",
                        ClassNames.realtimeChannel, ClassNames.blocksJson, MemberNames.decode, typeArgClassName
                    )
                } else {
                    funBuilder.addStatement(
                        "return %T.fromJson(element) { it }",
                        ClassNames.realtimeChannel
                    )
                }
            }
            "file-bucket/download" -> {
                funBuilder.addStatement("return %T.fromJson(element)", ClassNames.fileDownloadHandle)
            }
            "file-bucket/upload" -> {
                funBuilder.addStatement("return %T.fromJson(element)", ClassNames.fileUploadHandle)
            }
            else -> {
                funBuilder.addStatement(
                    "throw %T(%S)",
                    UnsupportedOperationException::class,
                    "Unknown transferable: ${entry.transferableName}"
                )
            }
        }

        return funBuilder.build()
    }

    private fun generateSerialize(entry: TransferableEntry): FunSpec {
        return FunSpec.builder("serialize")
            .addModifiers(KModifier.OVERRIDE)
            .addParameter("encoder", ClassNames.encoder)
            .addParameter("value", entry.returnType)
            .addStatement(
                "throw %T(%S)",
                UnsupportedOperationException::class,
                "Transferables are read-only"
            )
            .build()
    }

    private fun resolveTypeArgClassName(type: ResolvedType): ClassName {
        return when (type) {
            is ResolvedType.Record -> ClassName(packageName, type.name)
            is ResolvedType.TypeReference -> ClassName(packageName, type.name)
            else -> ClassNames.jsonElement
        }
    }
}
