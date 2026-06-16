package com.aws.blocks.example.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import blocks.testapp.AuthApi
import blocks.testapp.AuthApi.SetAuthState.Input.SignIn
import blocks.testapp.AuthApi.SetAuthState.Input.SignOut
import blocks.testapp.AuthApi.SetAuthState.Input.SignUp
import blocks.testapp.AuthState
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(auth: AuthApi, modifier: Modifier = Modifier) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var authState by remember { mutableStateOf<AuthState?>(null) }
    var output by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        authState = runCatching { auth.getAuthState() }.getOrNull()
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Text("Auth", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(16.dp))

        val user = authState?.user
        if (user != null) {
            Text("Signed in as: ${user.username}")
            Spacer(Modifier.height(8.dp))
            Button(onClick = {
                scope.launch {
                    runCatching {
                        auth.setAuthState(SignOut)
                    }.onSuccess {
                        authState = it
                        output = "Signed out"
                    }.onFailure {
                        output = "Error: ${it.message}"
                    }
                }
            }) { Text("Sign Out") }
        } else {
            TextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("Username") },
                modifier = Modifier.fillMaxWidth()
            )
            TextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        scope.launch {
                            runCatching {
                                auth.setAuthState(
                                    SignIn(
                                        username = username,
                                        password = password
                                    )
                                )
                            }.onSuccess {
                                authState = it
                                output = "Signed in as: ${it.user?.username}"
                            }.onFailure {
                                output = "Error: ${it.message}"
                            }
                        }
                    },
                    modifier = Modifier.weight(1f)
                ) { Text("Sign In") }
                Button(
                    onClick = {
                        scope.launch {
                            runCatching {
                                auth.setAuthState(
                                    SignUp(
                                        username = username,
                                        password = password
                                    )
                                )
                            }.onSuccess {
                                authState = it
                                output = "Signed up as: ${it.user?.username}"
                            }.onFailure {
                                output = "Error: ${it.message}"
                            }
                        }
                    },
                    modifier = Modifier.weight(1f)
                ) { Text("Sign Up") }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Output:", style = MaterialTheme.typography.titleSmall)
        Text(output)
    }
}
